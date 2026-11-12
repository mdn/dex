use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::sync::Semaphore;

#[derive(Clone, Copy, Debug)]
pub struct Bounds {
    pub start: usize,
    pub min: usize,
    pub max: usize,
}

/// Adaptive concurrency limit: grows while requests succeed, halves on backpressure.
pub struct Limiter {
    semaphore: Semaphore,
    state: Mutex<State>,
    bounds: Bounds,
    cooldown: Duration,
    limit: AtomicUsize,
    in_flight: AtomicUsize,
    decreases: AtomicU64,
}

struct State {
    limit: usize,
    /// Permits still to be withdrawn after a decrease, collected as requests finish.
    debt: usize,
    successes: usize,
    last_decrease: Option<Instant>,
}

pub struct Permit {
    limiter: Arc<Limiter>,
}

impl Limiter {
    pub fn new(bounds: Bounds, cooldown: Duration) -> Arc<Self> {
        let min = bounds.min.max(1);
        let max = bounds.max.max(min);
        let start = bounds.start.clamp(min, max);
        Arc::new(Self {
            semaphore: Semaphore::new(start),
            state: Mutex::new(State {
                limit: start,
                debt: 0,
                successes: 0,
                last_decrease: None,
            }),
            bounds: Bounds { start, min, max },
            cooldown,
            limit: AtomicUsize::new(start),
            in_flight: AtomicUsize::new(0),
            decreases: AtomicU64::new(0),
        })
    }

    pub async fn acquire(self: &Arc<Self>) -> Permit {
        self.semaphore
            .acquire()
            .await
            .expect("semaphore is never closed")
            .forget();
        self.in_flight.fetch_add(1, Ordering::Relaxed);
        Permit {
            limiter: Arc::clone(self),
        }
    }

    /// Grows the limit by 1/8 once a full window of requests has succeeded.
    pub fn on_success(&self) {
        let mut state = self.state.lock().unwrap();
        state.successes += 1;
        if state.successes < state.limit || state.limit >= self.bounds.max {
            return;
        }
        state.successes = 0;
        let step = (state.limit / 8).max(1).min(self.bounds.max - state.limit);
        state.limit += step;
        let repaid = step.min(state.debt);
        state.debt -= repaid;
        self.semaphore.add_permits(step - repaid);
        self.limit.store(state.limit, Ordering::Relaxed);
    }

    /// Halves the limit, at most once per cooldown so a burst of errors counts once.
    pub fn on_backpressure(&self) {
        let mut state = self.state.lock().unwrap();
        // Growth needs a full window without errors, even during the cooldown.
        state.successes = 0;
        let now = Instant::now();
        if state
            .last_decrease
            .is_some_and(|last| now.duration_since(last) < self.cooldown)
        {
            return;
        }
        state.last_decrease = Some(now);
        let target = (state.limit / 2).max(self.bounds.min);
        state.debt += state.limit - target;
        state.limit = target;
        while state.debt > 0 {
            match self.semaphore.try_acquire() {
                Ok(permit) => {
                    permit.forget();
                    state.debt -= 1;
                }
                Err(_) => break,
            }
        }
        self.limit.store(target, Ordering::Relaxed);
        self.decreases.fetch_add(1, Ordering::Relaxed);
    }

    pub fn limit(&self) -> usize {
        self.limit.load(Ordering::Relaxed)
    }

    pub fn in_flight(&self) -> usize {
        self.in_flight.load(Ordering::Relaxed)
    }

    pub fn decreases(&self) -> u64 {
        self.decreases.load(Ordering::Relaxed)
    }
}

impl Drop for Permit {
    fn drop(&mut self) {
        let limiter = &self.limiter;
        limiter.in_flight.fetch_sub(1, Ordering::Relaxed);
        let mut state = limiter.state.lock().unwrap();
        if state.debt > 0 {
            state.debt -= 1;
        } else {
            limiter.semaphore.add_permits(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn limiter(start: usize, min: usize, max: usize) -> Arc<Limiter> {
        Limiter::new(Bounds { start, min, max }, Duration::ZERO)
    }

    #[test]
    fn limit_follows_successes_and_backpressure() {
        struct Case {
            name: &'static str,
            bounds: (usize, usize, usize),
            successes: usize,
            backpressure: usize,
            expected: usize,
        }
        let cases = [
            Case {
                name: "unchanged below a full window",
                bounds: (16, 4, 64),
                successes: 15,
                backpressure: 0,
                expected: 16,
            },
            Case {
                name: "grows by 1/8 after a full window",
                bounds: (16, 4, 64),
                successes: 16,
                backpressure: 0,
                expected: 18,
            },
            Case {
                name: "capped at max",
                bounds: (60, 4, 64),
                successes: 1000,
                backpressure: 0,
                expected: 64,
            },
            Case {
                name: "halves on backpressure",
                bounds: (16, 4, 64),
                successes: 0,
                backpressure: 1,
                expected: 8,
            },
            Case {
                name: "floored at min",
                bounds: (16, 4, 64),
                successes: 0,
                backpressure: 5,
                expected: 4,
            },
        ];
        for case in cases {
            let (start, min, max) = case.bounds;
            let limiter = limiter(start, min, max);
            for _ in 0..case.successes {
                limiter.on_success();
            }
            for _ in 0..case.backpressure {
                limiter.on_backpressure();
            }
            assert_eq!(limiter.limit(), case.expected, "{}", case.name);
        }
    }

    #[test]
    fn cooldown_collapses_error_bursts() {
        let limiter = Limiter::new(
            Bounds {
                start: 64,
                min: 1,
                max: 64,
            },
            Duration::from_secs(60),
        );
        for _ in 0..10 {
            limiter.on_backpressure();
        }
        assert_eq!(limiter.limit(), 32);
        assert_eq!(limiter.decreases(), 1);
    }

    #[tokio::test]
    async fn decrease_withdraws_permits_held_by_in_flight_requests() {
        let limiter = limiter(4, 1, 8);
        let mut permits = Vec::new();
        for _ in 0..4 {
            permits.push(limiter.acquire().await);
        }
        limiter.on_backpressure();
        assert_eq!(limiter.limit(), 2);

        permits.truncate(1);
        assert_eq!(limiter.in_flight(), 1);
        assert_eq!(limiter.semaphore.available_permits(), 1);
    }
}
