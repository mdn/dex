use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::body::Bytes;
use axum::extract::{Path as UrlPath, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::put;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use dex_uploader::limiter::Bounds;
use dex_uploader::{Config, run};
use flate2::read::GzDecoder;

struct Object {
    body: Bytes,
    content_type: String,
    content_encoding: Option<String>,
    cache_control: Option<String>,
    hash: Option<String>,
}

#[derive(Default)]
struct Bucket {
    objects: Mutex<HashMap<String, Object>>,
    in_flight: AtomicUsize,
    peak_in_flight: AtomicUsize,
    /// Requests beyond this many concurrent ones get a 429.
    capacity: Option<usize>,
    reject_all_with: Option<StatusCode>,
}

async fn put_object(
    State(bucket): State<Arc<Bucket>>,
    UrlPath((_bucket, key)): UrlPath<(String, String)>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    if let Some(status) = bucket.reject_all_with {
        return status;
    }
    let in_flight = bucket.in_flight.fetch_add(1, Ordering::SeqCst) + 1;
    bucket.peak_in_flight.fetch_max(in_flight, Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(5)).await;
    bucket.in_flight.fetch_sub(1, Ordering::SeqCst);
    if bucket.capacity.is_some_and(|capacity| in_flight > capacity) {
        return StatusCode::TOO_MANY_REQUESTS;
    }
    let header = |name: &str| {
        headers
            .get(name)
            .map(|value| value.to_str().unwrap().to_owned())
    };
    bucket.objects.lock().unwrap().insert(
        key,
        Object {
            body,
            content_type: header("content-type").unwrap_or_default(),
            content_encoding: header("content-encoding"),
            cache_control: header("cache-control"),
            hash: header("x-goog-hash"),
        },
    );
    StatusCode::OK
}

async fn serve(bucket: Arc<Bucket>) -> String {
    let app = Router::new()
        .route("/{bucket}/{*key}", put(put_object))
        .with_state(bucket);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    endpoint
}

fn config(source: &Path, endpoint: String) -> Config {
    Config {
        source: source.to_owned(),
        bucket: "bucket".into(),
        prefix: "deployments/1".into(),
        endpoint,
        token: "token".into(),
        cache_control: Some("public, max-age=3600".into()),
        gzip_level: 6,
        crc32c: true,
        concurrency: Bounds {
            start: 64,
            min: 2,
            max: 128,
        },
        max_attempts: 10,
        backoff_base: Duration::from_millis(5),
        timeout: Duration::from_secs(10),
        stats_interval: Duration::from_millis(100),
        stats_file: None,
    }
}

fn write_files(root: &Path, count: usize) {
    for i in 0..count {
        let dir = root.join(format!("en-us/docs/page {i}"));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("index.html"),
            format!("<p>page {i}</p>").repeat(50),
        )
        .unwrap();
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn uploads_tree_with_metadata() {
    let source = tempfile::tempdir().unwrap();
    write_files(source.path(), 50);
    std::fs::write(source.path().join("logo.png"), [0x89, b'P', b'N', b'G']).unwrap();
    let stats_file = source.path().with_extension("csv");

    let bucket = Arc::new(Bucket::default());
    let mut config = config(source.path(), serve(Arc::clone(&bucket)).await);
    config.stats_file = Some(stats_file.clone());
    let summary = run(config).await.unwrap();

    assert_eq!(summary.files, 51);
    assert_eq!(summary.failed, 0);
    assert_eq!(summary.retries, 0);
    assert!(summary.wire_bytes < summary.raw_bytes);

    let objects = bucket.objects.lock().unwrap();
    assert_eq!(objects.len(), 51);

    let page = &objects["deployments/1/en-us/docs/page 7/index.html"];
    assert_eq!(page.content_type, "text/html");
    assert_eq!(page.content_encoding.as_deref(), Some("gzip"));
    assert_eq!(page.cache_control.as_deref(), Some("public, max-age=3600"));
    let mut html = String::new();
    GzDecoder::new(&page.body[..])
        .read_to_string(&mut html)
        .unwrap();
    assert_eq!(html, "<p>page 7</p>".repeat(50));

    let logo = &objects["deployments/1/logo.png"];
    assert_eq!(logo.content_type, "image/png");
    assert_eq!(logo.content_encoding, None);
    assert_eq!(&logo.body[..], [0x89, b'P', b'N', b'G']);

    // CRC32C is computed over the stored (gzipped) bytes.
    for object in objects.values() {
        let expected = STANDARD.encode(crc32c::crc32c(&object.body).to_be_bytes());
        assert_eq!(
            object.hash.as_deref(),
            Some(format!("crc32c={expected}").as_str())
        );
    }

    let csv = std::fs::read_to_string(&stats_file).unwrap();
    std::fs::remove_file(&stats_file).unwrap();
    assert!(csv.starts_with("elapsed_s,files,files_per_s,wire_mb_per_s,raw_mb_per_s,"));
}

#[tokio::test(flavor = "multi_thread")]
async fn backs_off_and_completes_when_throttled() {
    let source = tempfile::tempdir().unwrap();
    write_files(source.path(), 600);

    let bucket = Arc::new(Bucket {
        capacity: Some(16),
        ..Default::default()
    });
    let summary = run(config(source.path(), serve(Arc::clone(&bucket)).await))
        .await
        .unwrap();

    assert_eq!(summary.files, 600);
    assert_eq!(summary.failed, 0);
    assert_eq!(bucket.objects.lock().unwrap().len(), 600);
    assert!(summary.retries > 0, "expected retries");
    assert_eq!(summary.retry_causes.get("429"), Some(&summary.retries));
    assert!(summary.limit_decreases > 0, "expected the limit to drop");
    assert!(summary.final_limit < 64, "limit {}", summary.final_limit);
}

#[tokio::test(flavor = "multi_thread")]
async fn fails_on_rejected_credentials_and_exhausted_retries() {
    struct Case {
        status: StatusCode,
        expected: &'static str,
    }
    let cases = [
        Case {
            status: StatusCode::UNAUTHORIZED,
            expected: "401 Unauthorized",
        },
        Case {
            status: StatusCode::SERVICE_UNAVAILABLE,
            expected: "gave up after 3 attempts: 503 Service Unavailable",
        },
        Case {
            status: StatusCode::PRECONDITION_FAILED,
            expected: "gave up after 3 attempts: 412 Precondition Failed",
        },
    ];
    for case in cases {
        let source = tempfile::tempdir().unwrap();
        write_files(source.path(), 20);

        let bucket = Arc::new(Bucket {
            reject_all_with: Some(case.status),
            ..Default::default()
        });
        let mut config = config(source.path(), serve(Arc::clone(&bucket)).await);
        config.max_attempts = 3;
        let error = format!("{:#}", run(config).await.unwrap_err());

        assert!(error.contains(case.expected), "{}: {error}", case.status);
        assert!(bucket.objects.lock().unwrap().is_empty());
    }
}
