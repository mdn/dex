use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::Semaphore;

#[derive(Clone, Copy, Debug)]
pub struct Bounds {
    pub start: usize,
    pub min: usize,
    pub max: usize,
}

/// Adaptive concurrency limit: grows while requests succeed, shrinks on backpressure.
pub struct Limiter {
    semaphore: Semaphore,
    state: Mutex<State>,
    bounds: Bounds,
    limit: AtomicUsize,
    generation: AtomicU64,
    in_flight: AtomicUsize,
    decreases: AtomicU64,
}

struct State {
    limit: usize,
    /// Permits still to be withdrawn after a decrease, collected as requests finish.
    debt: usize,
    successes: usize,
    /// Limit at which backpressure last set in.
    ceiling: Option<usize>,
}

pub struct Permit {
    limiter: Arc<Limiter>,
    generation: u64,
}

impl Limiter {
    pub fn new(bounds: Bounds) -> Arc<Self> {
        let min = bounds.min.max(1);
        let max = bounds.max.max(min);
        let start = bounds.start.clamp(min, max);
        Arc::new(Self {
            semaphore: Semaphore::new(start),
            state: Mutex::new(State {
                limit: start,
                debt: 0,
                successes: 0,
                ceiling: None,
            }),
            bounds: Bounds { start, min, max },
            limit: AtomicUsize::new(start),
            generation: AtomicU64::new(0),
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
            generation: self.generation.load(Ordering::Relaxed),
        }
    }

    /// Grows the limit once a full window of requests has succeeded: by 1/8
    /// while well below the last ceiling, by 1/64 when probing near or beyond it.
    pub fn on_success(&self) {
        let mut state = self.state.lock().unwrap();
        state.successes += 1;
        if state.successes < state.limit || state.limit >= self.bounds.max {
            return;
        }
        state.successes = 0;
        let limit = state.limit;
        let knee = state.ceiling.map(|ceiling| ceiling * 9 / 10);
        let step = match knee {
            Some(knee) if limit >= knee => limit / 64,
            Some(knee) => (limit / 8).min(knee - limit),
            None => limit / 8,
        };
        let step = step.max(1).min(self.bounds.max - limit);
        state.limit += step;
        let repaid = step.min(state.debt);
        state.debt -= repaid;
        self.semaphore.add_permits(step - repaid);
        self.limit.store(state.limit, Ordering::Relaxed);
    }

    /// Cuts the limit to 3/4, once per generation: failures of requests that
    /// started before the last cut belong to the same episode.
    pub fn on_backpressure(&self, generation: u64) {
        let mut state = self.state.lock().unwrap();
        // Growth needs a full window without errors, stale ones included.
        state.successes = 0;
        if generation < self.generation.load(Ordering::Relaxed) {
            return;
        }
        self.generation.fetch_add(1, Ordering::Relaxed);
        state.ceiling = Some(state.limit);
        let target = (state.limit * 3 / 4).max(self.bounds.min);
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

    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::Relaxed)
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

impl Permit {
    pub fn generation(&self) -> u64 {
        self.generation
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
        Limiter::new(Bounds { start, min, max })
    }

    fn succeed(limiter: &Limiter, count: usize) {
        for _ in 0..count {
            limiter.on_success();
        }
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
                name: "cut to 3/4 on backpressure",
                bounds: (16, 4, 64),
                successes: 0,
                backpressure: 1,
                expected: 12,
            },
            Case {
                name: "floored at min",
                bounds: (16, 4, 64),
                successes: 0,
                backpressure: 8,
                expected: 4,
            },
        ];
        for case in cases {
            let (start, min, max) = case.bounds;
            let limiter = limiter(start, min, max);
            succeed(&limiter, case.successes);
            for _ in 0..case.backpressure {
                limiter.on_backpressure(limiter.generation());
            }
            assert_eq!(limiter.limit(), case.expected, "{}", case.name);
        }
    }

    #[test]
    fn failures_from_before_a_cut_do_not_cut_again() {
        let limiter = limiter(64, 1, 64);
        let generation = limiter.generation();
        for _ in 0..10 {
            limiter.on_backpressure(generation);
        }
        assert_eq!(limiter.limit(), 48);
        assert_eq!(limiter.decreases(), 1);

        limiter.on_backpressure(limiter.generation());
        assert_eq!(limiter.limit(), 36);
    }

    #[test]
    fn growth_slows_near_the_last_ceiling() {
        let limiter = limiter(64, 1, 1024);
        limiter.on_backpressure(limiter.generation());
        assert_eq!(limiter.limit(), 48);

        // Fast up to 90% of the ceiling of 64, then one step of 1/64 per window.
        for expected in [54, 57, 58, 59] {
            succeed(&limiter, limiter.limit());
            assert_eq!(limiter.limit(), expected);
        }
    }

    #[tokio::test]
    async fn decrease_withdraws_permits_held_by_in_flight_requests() {
        let limiter = limiter(4, 1, 8);
        let mut permits = Vec::new();
        for _ in 0..4 {
            permits.push(limiter.acquire().await);
        }
        limiter.on_backpressure(permits[0].generation());
        assert_eq!(limiter.limit(), 3);

        permits.truncate(1);
        assert_eq!(limiter.in_flight(), 1);
        assert_eq!(limiter.semaphore.available_permits(), 2);
    }
}
