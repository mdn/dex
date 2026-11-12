use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use tokio::sync::oneshot;

use crate::limiter::Limiter;

const MB: f64 = 1_000_000.0;

#[derive(Default)]
pub struct Stats {
    pub total_files: u64,
    files: AtomicU64,
    raw_bytes: AtomicU64,
    wire_bytes: AtomicU64,
    retries: AtomicU64,
    failed: AtomicU64,
}

#[derive(Clone, Copy, Default)]
struct Snapshot {
    files: u64,
    raw_bytes: u64,
    wire_bytes: u64,
}

#[derive(Debug)]
pub struct Summary {
    pub files: u64,
    pub failed: u64,
    pub raw_bytes: u64,
    pub wire_bytes: u64,
    pub retries: u64,
    pub limit_decreases: u64,
    pub final_limit: usize,
    pub peak_files_per_s: f64,
    pub peak_wire_mb_per_s: f64,
    pub elapsed: Duration,
}

impl Stats {
    pub fn new(total_files: u64) -> Self {
        Self {
            total_files,
            ..Default::default()
        }
    }

    pub fn uploaded(&self, raw_bytes: u64, wire_bytes: u64) {
        self.files.fetch_add(1, Ordering::Relaxed);
        self.raw_bytes.fetch_add(raw_bytes, Ordering::Relaxed);
        self.wire_bytes.fetch_add(wire_bytes, Ordering::Relaxed);
    }

    pub fn retried(&self) {
        self.retries.fetch_add(1, Ordering::Relaxed);
    }

    pub fn failed(&self) {
        self.failed.fetch_add(1, Ordering::Relaxed);
    }

    fn snapshot(&self) -> Snapshot {
        Snapshot {
            files: self.files.load(Ordering::Relaxed),
            raw_bytes: self.raw_bytes.load(Ordering::Relaxed),
            wire_bytes: self.wire_bytes.load(Ordering::Relaxed),
        }
    }
}

impl Summary {
    pub fn files_per_s(&self) -> f64 {
        self.files as f64 / self.elapsed.as_secs_f64().max(f64::EPSILON)
    }

    pub fn wire_mb_per_s(&self) -> f64 {
        self.wire_bytes as f64 / MB / self.elapsed.as_secs_f64().max(f64::EPSILON)
    }

    pub fn raw_mb_per_s(&self) -> f64 {
        self.raw_bytes as f64 / MB / self.elapsed.as_secs_f64().max(f64::EPSILON)
    }
}

impl std::fmt::Display for Summary {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(
            f,
            "Uploaded {} files ({} failed) in {:.1}s",
            self.files,
            self.failed,
            self.elapsed.as_secs_f64()
        )?;
        writeln!(
            f,
            "  average: {:.0} files/s, {:.2} MB/s on the wire ({:.2} MB/s uncompressed)",
            self.files_per_s(),
            self.wire_mb_per_s(),
            self.raw_mb_per_s()
        )?;
        writeln!(
            f,
            "  peak:    {:.0} files/s, {:.2} MB/s on the wire",
            self.peak_files_per_s, self.peak_wire_mb_per_s
        )?;
        writeln!(
            f,
            "  total:   {:.1} MB on the wire, {:.1} MB uncompressed",
            self.wire_bytes as f64 / MB,
            self.raw_bytes as f64 / MB
        )?;
        write!(
            f,
            "  retries: {}, concurrency decreases: {}, final concurrency limit: {}",
            self.retries, self.limit_decreases, self.final_limit
        )
    }
}

/// Prints (and optionally writes as CSV) one throughput sample per interval until stopped.
pub async fn report(
    stats: Arc<Stats>,
    limiter: Arc<Limiter>,
    interval: Duration,
    csv_path: Option<&Path>,
    mut stop: oneshot::Receiver<()>,
) -> Result<Summary> {
    let mut csv = csv_path
        .map(|path| {
            let file = File::create(path)
                .with_context(|| format!("cannot create stats file {}", path.display()))?;
            let mut csv = BufWriter::new(file);
            writeln!(
                csv,
                "elapsed_s,files,files_per_s,wire_mb_per_s,raw_mb_per_s,concurrency_limit,in_flight,retries,limit_decreases,failed"
            )?;
            anyhow::Ok(csv)
        })
        .transpose()?;

    let start = Instant::now();
    let mut ticker = tokio::time::interval(interval);
    ticker.tick().await;

    let mut previous = Snapshot::default();
    let mut previous_at = start;
    let mut peak_files_per_s = 0.0_f64;
    let mut peak_wire_mb_per_s = 0.0_f64;

    loop {
        let stopping = tokio::select! {
            _ = ticker.tick() => false,
            _ = &mut stop => true,
        };
        let now = Instant::now();
        let current = stats.snapshot();
        let window = now.duration_since(previous_at).as_secs_f64();
        // A final partial window is too short to give a meaningful rate.
        if !stopping || window >= interval.as_secs_f64() / 2.0 {
            let files_per_s = (current.files - previous.files) as f64 / window;
            let wire_mb_per_s = (current.wire_bytes - previous.wire_bytes) as f64 / MB / window;
            let raw_mb_per_s = (current.raw_bytes - previous.raw_bytes) as f64 / MB / window;
            peak_files_per_s = peak_files_per_s.max(files_per_s);
            peak_wire_mb_per_s = peak_wire_mb_per_s.max(wire_mb_per_s);

            let elapsed = now.duration_since(start).as_secs_f64();
            let retries = stats.retries.load(Ordering::Relaxed);
            let failed = stats.failed.load(Ordering::Relaxed);
            println!(
                "[{elapsed:6.0}s] {}/{} files | {files_per_s:5.0} files/s | {wire_mb_per_s:6.2} MB/s wire ({raw_mb_per_s:6.2} MB/s raw) | in flight {}/{} | retries {retries} | decreases {} | failed {failed}",
                current.files,
                stats.total_files,
                limiter.in_flight(),
                limiter.limit(),
                limiter.decreases(),
            );
            if let Some(csv) = csv.as_mut() {
                writeln!(
                    csv,
                    "{elapsed:.1},{},{files_per_s:.1},{wire_mb_per_s:.3},{raw_mb_per_s:.3},{},{},{retries},{},{failed}",
                    current.files,
                    limiter.limit(),
                    limiter.in_flight(),
                    limiter.decreases(),
                )?;
            }
        }
        previous = current;
        previous_at = now;
        if stopping {
            break;
        }
    }

    if let Some(mut csv) = csv {
        csv.flush()?;
    }

    let total = stats.snapshot();
    let mut summary = Summary {
        files: total.files,
        failed: stats.failed.load(Ordering::Relaxed),
        raw_bytes: total.raw_bytes,
        wire_bytes: total.wire_bytes,
        retries: stats.retries.load(Ordering::Relaxed),
        limit_decreases: limiter.decreases(),
        final_limit: limiter.limit(),
        peak_files_per_s,
        peak_wire_mb_per_s,
        elapsed: start.elapsed(),
    };
    // Runs shorter than one interval never produce a sample.
    summary.peak_files_per_s = summary.peak_files_per_s.max(summary.files_per_s());
    summary.peak_wire_mb_per_s = summary.peak_wire_mb_per_s.max(summary.wire_mb_per_s());
    Ok(summary)
}
