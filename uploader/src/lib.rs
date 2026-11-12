pub mod limiter;
pub mod stats;

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use bytes::Bytes;
use flate2::Compression;
use flate2::write::GzEncoder;
use reqwest::header::{CACHE_CONTROL, CONTENT_ENCODING, CONTENT_TYPE, RETRY_AFTER};
use reqwest::{Client, StatusCode, Url};
use tokio::sync::{Semaphore, oneshot};
use tokio::task::JoinSet;
use walkdir::WalkDir;

use limiter::{Bounds, Limiter};
use stats::{Stats, Summary};

pub const DEFAULT_ENDPOINT: &str = "https://storage.googleapis.com";

/// Formats that are already compressed, where gzip only costs CPU.
const INCOMPRESSIBLE: &[&str] = &[
    "avif", "br", "gif", "gz", "ico", "jpeg", "jpg", "mp3", "mp4", "ogg", "pdf", "png", "webm",
    "webp", "woff", "woff2", "zip", "zst",
];

const MAX_BACKOFF: Duration = Duration::from_secs(30);
const MAX_REPORTED_FAILURES: usize = 20;

#[derive(Clone, Debug)]
pub struct Config {
    pub source: PathBuf,
    pub bucket: String,
    pub prefix: String,
    pub endpoint: String,
    pub token: String,
    pub cache_control: Option<String>,
    /// 0 uploads everything uncompressed.
    pub gzip_level: u32,
    pub concurrency: Bounds,
    /// Number of HTTP clients to spread requests over; each HTTP/2 connection
    /// only carries a limited number of concurrent streams.
    pub connections: usize,
    pub http1: bool,
    pub max_attempts: u32,
    pub backoff_base: Duration,
    pub timeout: Duration,
    pub stats_interval: Duration,
    pub stats_file: Option<PathBuf>,
}

struct Shared {
    config: Config,
    base_url: Url,
    clients: Vec<Client>,
    limiter: Arc<Limiter>,
    stats: Arc<Stats>,
    cpu: Semaphore,
    abort: AtomicBool,
}

struct Payload {
    body: Bytes,
    raw_len: u64,
    gzipped: bool,
}

enum Outcome {
    Done,
    Retry {
        /// Status code or kind of transport error, for the retry statistics.
        cause: String,
        reason: String,
        after: Option<Duration>,
    },
    Fatal {
        reason: String,
        abort: bool,
    },
}

pub async fn run(config: Config) -> Result<Summary> {
    let files = collect_files(&config.source)?;
    if files.is_empty() {
        bail!("no files found in {}", config.source.display());
    }

    let base_url = Url::parse(&config.endpoint)
        .with_context(|| format!("invalid endpoint {}", config.endpoint))?;
    let clients = (0..config.connections.max(1))
        .map(|_| build_client(&config))
        .collect::<Result<Vec<_>>>()?;
    let limiter = Limiter::new(config.concurrency, Duration::from_secs(1));
    let stats = Arc::new(Stats::new(files.len() as u64));
    let cpus = std::thread::available_parallelism().map_or(1, |n| n.get());

    let (stop, stopped) = oneshot::channel();
    let reporter = tokio::spawn({
        let (stats, limiter) = (Arc::clone(&stats), Arc::clone(&limiter));
        let (interval, stats_file) = (config.stats_interval, config.stats_file.clone());
        async move { stats::report(stats, limiter, interval, stats_file.as_deref(), stopped).await }
    });

    // Keeps the number of buffered payloads bounded while the limit is low.
    let max_tasks = config.concurrency.max.max(1) * 2;
    let shared = Arc::new(Shared {
        config,
        base_url,
        clients,
        limiter,
        stats,
        cpu: Semaphore::new(cpus),
        abort: AtomicBool::new(false),
    });

    let mut failures = Vec::new();
    let mut tasks = JoinSet::new();
    for (index, (path, key)) in files.into_iter().enumerate() {
        while tasks.len() >= max_tasks {
            collect(&mut tasks, &mut failures).await;
        }
        if shared.abort.load(Ordering::Relaxed) {
            break;
        }
        let shared = Arc::clone(&shared);
        tasks.spawn(async move {
            let result = upload(&shared, index, &path, &key).await;
            if result.is_err() {
                shared.stats.failed();
            }
            result.with_context(|| key)
        });
    }
    while !tasks.is_empty() {
        collect(&mut tasks, &mut failures).await;
    }

    let _ = stop.send(());
    let summary = reporter.await??;

    if !failures.is_empty() {
        let shown = failures
            .iter()
            .take(MAX_REPORTED_FAILURES)
            .map(|error| format!("  {error:#}"))
            .collect::<Vec<_>>()
            .join("\n");
        bail!(
            "{} of {} uploads failed:\n{shown}\n\n{summary}",
            failures.len(),
            shared.stats.total_files
        );
    }
    Ok(summary)
}

async fn collect(tasks: &mut JoinSet<Result<()>>, failures: &mut Vec<anyhow::Error>) {
    match tasks.join_next().await {
        Some(Ok(Ok(()))) | None => {}
        Some(Ok(Err(error))) => failures.push(error),
        Some(Err(error)) => failures.push(anyhow!(error)),
    }
}

fn build_client(config: &Config) -> Result<Client> {
    let mut builder = Client::builder()
        .timeout(config.timeout)
        .connect_timeout(Duration::from_secs(10))
        .pool_max_idle_per_host(config.concurrency.max);
    if config.http1 {
        builder = builder.http1_only();
    }
    builder.build().context("cannot build HTTP client")
}

fn collect_files(source: &Path) -> Result<Vec<(PathBuf, String)>> {
    let mut files = Vec::new();
    for entry in WalkDir::new(source) {
        let entry = entry?;
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry.path().strip_prefix(source)?;
        let key = relative
            .components()
            .map(|component| {
                component
                    .as_os_str()
                    .to_str()
                    .ok_or_else(|| anyhow!("non-UTF-8 path {}", entry.path().display()))
            })
            .collect::<Result<Vec<_>>>()?
            .join("/");
        files.push((entry.into_path(), key));
    }
    Ok(files)
}

fn object_url(base: &Url, bucket: &str, prefix: &str, key: &str) -> Result<Url> {
    let mut url = base.clone();
    url.path_segments_mut()
        .map_err(|()| anyhow!("endpoint cannot be a base URL"))?
        .pop_if_empty()
        .push(bucket)
        .extend(prefix.split('/').filter(|segment| !segment.is_empty()))
        .extend(key.split('/'));
    Ok(url)
}

fn should_gzip(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_none_or(|extension| !INCOMPRESSIBLE.contains(&extension.to_ascii_lowercase().as_str()))
}

fn prepare(path: &Path, gzip_level: u32) -> Result<Payload> {
    let raw = std::fs::read(path).with_context(|| format!("cannot read {}", path.display()))?;
    let raw_len = raw.len() as u64;
    if gzip_level == 0 || !should_gzip(path) {
        return Ok(Payload {
            body: raw.into(),
            raw_len,
            gzipped: false,
        });
    }
    let mut encoder = GzEncoder::new(
        Vec::with_capacity(raw.len() / 3),
        Compression::new(gzip_level),
    );
    encoder.write_all(&raw)?;
    Ok(Payload {
        body: encoder.finish()?.into(),
        raw_len,
        gzipped: true,
    })
}

async fn upload(shared: &Arc<Shared>, index: usize, path: &Path, key: &str) -> Result<()> {
    let config = &shared.config;
    let payload = {
        let _cpu = shared.cpu.acquire().await?;
        let (path, level) = (path.to_owned(), config.gzip_level);
        tokio::task::spawn_blocking(move || prepare(&path, level)).await??
    };
    let url = object_url(&shared.base_url, &config.bucket, &config.prefix, key)?;
    let content_type = mime_guess::from_path(path).first_or_octet_stream();
    let client = &shared.clients[index % shared.clients.len()];

    let mut last_reason = String::new();
    for attempt in 0..config.max_attempts {
        if shared.abort.load(Ordering::Relaxed) {
            bail!("aborted");
        }
        let outcome = {
            let _permit = shared.limiter.acquire().await;
            let mut request = client
                .put(url.clone())
                .bearer_auth(&config.token)
                .header(CONTENT_TYPE, content_type.as_ref())
                .body(payload.body.clone());
            if payload.gzipped {
                request = request.header(CONTENT_ENCODING, "gzip");
            }
            if let Some(cache_control) = &config.cache_control {
                request = request.header(CACHE_CONTROL, cache_control);
            }
            classify(request.send().await).await
        };
        match outcome {
            Outcome::Done => {
                shared.limiter.on_success();
                shared
                    .stats
                    .uploaded(payload.raw_len, payload.body.len() as u64);
                return Ok(());
            }
            Outcome::Fatal { reason, abort } => {
                if abort {
                    shared.abort.store(true, Ordering::Relaxed);
                }
                bail!(reason);
            }
            Outcome::Retry {
                cause,
                reason,
                after,
            } => {
                shared.limiter.on_backpressure();
                if attempt + 1 < config.max_attempts && shared.stats.retried(&cause) {
                    eprintln!("first retry caused by {cause}: {reason}");
                }
                last_reason = reason;
                if attempt + 1 < config.max_attempts {
                    tokio::time::sleep(after.unwrap_or_else(|| backoff(config, attempt))).await;
                }
            }
        }
    }
    bail!(
        "gave up after {} attempts: {last_reason}",
        config.max_attempts
    )
}

async fn classify(response: reqwest::Result<reqwest::Response>) -> Outcome {
    let response = match response {
        Ok(response) => response,
        // Timeouts and resets are how an overloaded endpoint usually shows up.
        Err(error) => {
            let cause = if error.is_timeout() {
                "timeout"
            } else if error.is_connect() {
                "connect"
            } else {
                "transport"
            };
            return Outcome::Retry {
                cause: cause.to_owned(),
                reason: format!("{error:#}"),
                after: None,
            };
        }
    };
    let status = response.status();
    if status.is_success() {
        return Outcome::Done;
    }
    let after = response
        .headers()
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
        .map(|seconds: u64| Duration::from_secs(seconds).min(MAX_BACKOFF));
    let body = response.text().await.unwrap_or_default();
    let reason = format!("{status}: {}", body.chars().take(300).collect::<String>());
    match status {
        StatusCode::REQUEST_TIMEOUT | StatusCode::TOO_MANY_REQUESTS => Outcome::Retry {
            cause: status.as_u16().to_string(),
            reason,
            after,
        },
        status if status.is_server_error() => Outcome::Retry {
            cause: status.as_u16().to_string(),
            reason,
            after,
        },
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Outcome::Fatal {
            reason,
            abort: true,
        },
        _ => Outcome::Fatal {
            reason,
            abort: false,
        },
    }
}

/// Exponential backoff with full jitter.
fn backoff(config: &Config, attempt: u32) -> Duration {
    let ceiling = config
        .backoff_base
        .saturating_mul(2_u32.saturating_pow(attempt))
        .min(MAX_BACKOFF);
    ceiling.mul_f64(fastrand::f64())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn object_url_encodes_segments() {
        struct Case {
            name: &'static str,
            endpoint: &'static str,
            prefix: &'static str,
            key: &'static str,
            expected: &'static str,
        }
        let cases = [
            Case {
                name: "nested prefix",
                endpoint: "https://storage.googleapis.com",
                prefix: "deployments/1",
                key: "en-us/index.html",
                expected: "https://storage.googleapis.com/bucket/deployments/1/en-us/index.html",
            },
            Case {
                name: "empty prefix and trailing slash",
                endpoint: "http://localhost:4443/",
                prefix: "",
                key: "robots.txt",
                expected: "http://localhost:4443/bucket/robots.txt",
            },
            Case {
                name: "reserved characters",
                endpoint: "https://storage.googleapis.com",
                prefix: "fred/",
                key: "docs/a b/what?/#x.json",
                expected: "https://storage.googleapis.com/bucket/fred/docs/a%20b/what%3F/%23x.json",
            },
        ];
        for case in cases {
            let base = Url::parse(case.endpoint).unwrap();
            let url = object_url(&base, "bucket", case.prefix, case.key).unwrap();
            assert_eq!(url.as_str(), case.expected, "{}", case.name);
        }
    }

    #[test]
    fn gzip_skips_compressed_formats() {
        let cases = [
            ("index.html", true),
            ("index.json", true),
            ("contributors.txt", true),
            ("no-extension", true),
            ("photo.PNG", false),
            ("font.woff2", false),
        ];
        for (path, expected) in cases {
            assert_eq!(should_gzip(Path::new(path)), expected, "{path}");
        }
    }
}
