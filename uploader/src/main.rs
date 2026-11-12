use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use clap::Parser;
use dex_uploader::limiter::Bounds;
use dex_uploader::{Config, DEFAULT_ENDPOINT, run};

/// Upload a directory to Cloud Storage, adapting concurrency to API backpressure.
#[derive(Parser)]
#[command(version)]
struct Cli {
    /// Directory to upload.
    source: PathBuf,

    /// Destination, as `gs://<bucket>[/<prefix>]`.
    destination: String,

    /// OAuth access token; falls back to `gcloud auth print-access-token`.
    #[arg(long, env = "GCS_ACCESS_TOKEN", hide_env_values = true)]
    token: Option<String>,

    /// `Cache-Control` value for every object.
    #[arg(long)]
    cache_control: Option<String>,

    /// gzip level (1-9) for compressible files; 0 disables compression.
    #[arg(long, default_value_t = 6, value_parser = clap::value_parser!(u32).range(0..=9))]
    gzip_level: u32,

    /// Initial number of concurrent requests.
    #[arg(long, default_value_t = 128)]
    concurrency: usize,

    /// Lower bound for the adaptive concurrency limit.
    #[arg(long, default_value_t = 8)]
    min_concurrency: usize,

    /// Upper bound for the adaptive concurrency limit.
    #[arg(long, default_value_t = 2048)]
    max_concurrency: usize,

    /// Upload in random order, to spread writes across the bucket's key range.
    #[arg(long)]
    shuffle: bool,

    /// Attempts per object before giving up.
    #[arg(long, default_value_t = 8)]
    max_attempts: u32,

    /// Per-request timeout in seconds.
    #[arg(long, default_value_t = 60)]
    timeout: u64,

    /// Seconds between throughput samples.
    #[arg(long, default_value_t = 5)]
    stats_interval: u64,

    /// Write the throughput samples to this CSV file.
    #[arg(long)]
    stats_file: Option<PathBuf>,

    /// Cloud Storage XML API endpoint.
    #[arg(long, default_value = DEFAULT_ENDPOINT)]
    endpoint: String,
}

fn parse_destination(destination: &str) -> Result<(String, String)> {
    let Some(rest) = destination.strip_prefix("gs://") else {
        bail!("destination must start with gs://");
    };
    let (bucket, prefix) = rest.split_once('/').unwrap_or((rest, ""));
    if bucket.is_empty() {
        bail!("destination has no bucket");
    }
    Ok((bucket.to_owned(), prefix.trim_matches('/').to_owned()))
}

async fn gcloud_token() -> Result<String> {
    let output = tokio::process::Command::new("gcloud")
        .args(["auth", "print-access-token"])
        .output()
        .await
        .context("GCS_ACCESS_TOKEN is not set and gcloud could not be run")?;
    if !output.status.success() {
        bail!(
            "gcloud auth print-access-token failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(String::from_utf8(output.stdout)?.trim().to_owned())
}

async fn main_inner() -> Result<()> {
    let cli = Cli::parse();
    let (bucket, prefix) = parse_destination(&cli.destination)?;
    let token = match cli.token {
        Some(token) => token,
        None => gcloud_token().await?,
    };
    let summary = run(Config {
        source: cli.source,
        bucket,
        prefix,
        endpoint: cli.endpoint,
        token,
        cache_control: cli.cache_control,
        gzip_level: cli.gzip_level,
        concurrency: Bounds {
            start: cli.concurrency,
            min: cli.min_concurrency,
            max: cli.max_concurrency,
        },
        shuffle: cli.shuffle,
        max_attempts: cli.max_attempts,
        backoff_base: Duration::from_millis(500),
        timeout: Duration::from_secs(cli.timeout),
        stats_interval: Duration::from_secs(cli.stats_interval.max(1)),
        stats_file: cli.stats_file,
    })
    .await?;
    println!("{summary}");
    Ok(())
}

#[tokio::main]
async fn main() -> ExitCode {
    match main_inner().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error:#}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn destination_is_split_into_bucket_and_prefix() {
        let cases = [
            ("gs://bucket", Some(("bucket", ""))),
            ("gs://bucket/", Some(("bucket", ""))),
            (
                "gs://bucket/deployments/1/",
                Some(("bucket", "deployments/1")),
            ),
            ("bucket/prefix", None),
            ("gs:///prefix", None),
        ];
        for (destination, expected) in cases {
            let actual = parse_destination(destination).ok();
            let expected = expected.map(|(bucket, prefix)| (bucket.to_owned(), prefix.to_owned()));
            assert_eq!(actual, expected, "{destination}");
        }
    }
}
