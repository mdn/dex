# Cloud Function logging

Runtime code uses [src/logging.js](./src/logging.js) to write one JSON object
per line to stdout. Each record includes `severity`, `message`, `event`, and a
`context` object containing the fields available at its call site. The context
is an empty object when no fields are supplied. Cloud Logging ingests these as
[structured logs](https://docs.cloud.google.com/logging/docs/structured-logging).
Use `jsonPayload.event` and `jsonPayload.context.<field>` to query events;
severity is available as the log entry's `severity` field. For example:

```json
{
  "severity": "INFO",
  "message": "Upstream request completed",
  "event": "upstream_request",
  "context": {
    "source": "content",
    "operation": "proxy",
    "route": "docs",
    "format": "index_json",
    "outcome": "success",
    "status": 200,
    "duration_ms": 82
  }
}
```

## Events

The Context column lists fields inside the `context` object. Fields listed after
"optionally" depend on the call site or outcome.

| Event                      | Severity                                                   | When it is logged                                                                                                                           | Context                                                                                                   |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `upstream_request`         | `INFO` for `success`; otherwise `WARNING`                  | An upstream proxy or fetch attempt completes or fails. One record per measured attempt.                                                     | Always `source`, `operation`, `outcome`, `duration_ms`; optionally `status`, `route`, `format`, `locale`. |
| `content_fallback`         | `INFO`; `WARNING` when a localized 404 page is unavailable | A content or attachment request selects a fallback after an upstream 404.                                                                   | `decision`; optionally `route`, `format`, `status`.                                                       |
| `redirect`                 | `INFO`                                                     | A redirect is selected by URL/locale middleware, search, advertising clicks, or the review asset fallback.                                  | `reason`, `status`; optionally `route`, `format`.                                                         |
| `request_rejected`         | `WARNING`                                                  | Origin checks, playground validation, advertising referer/code validation, or image validation reject a request or upstream image response. | `reason`, `status`; optionally `route`, `format`.                                                         |
| `request_aborted`          | `WARNING`                                                  | The client connection closes before the response finishes.                                                                                  | `route`; optionally `format`.                                                                             |
| `request_error`            | `ERROR`                                                    | Middleware reports an error to the router completion callback, or synchronous router dispatch fails without Sentry enabled.                 | `route`, `error_type`, `error_outcome`; optionally `format`.                                              |
| `headers_already_sent`     | `WARNING`                                                  | Content response headers cannot be set because headers have already been sent.                                                              | `route`; optionally `format`.                                                                             |
| `search_suggestions_error` | `ERROR`                                                    | Search suggestions fail and return HTTP 500.                                                                                                | `error_type`, `error_outcome`.                                                                            |
| `search_fallback`          | `WARNING`                                                  | The search index cannot be loaded, so the search redirect uses full-text results.                                                           | `decision: "full_text"`, `error_type`, `error_outcome`.                                                   |
| `advertising_fallback`     | `INFO`                                                     | A sidedoor request yields no usable placements, so individual placements are requested.                                                     | `decision: "individual_placements"`.                                                                      |
| `advertising_error`        | `ERROR`                                                    | Advertising click/view handling or sidedoor processing fails, or individual placement requests are rejected.                                | `operation`; either `error_type` and `error_outcome`, or `rejected_count` for placement failures.         |
| `advertising_invalid_url`  | `WARNING`                                                  | A decoded advertising URL uses an unexpected protocol. This event does not itself reject the URL.                                           | No additional fields.                                                                                     |

The call sites are in [app.js](./src/app.js), [handlers](./src/handlers/),
[middlewares](./src/middlewares/), [headers.js](./src/headers.js),
[utils.js](./src/utils.js), and the server paths in
[quicksearch](./src/internal/quicksearch/), [pong](./src/internal/pong/), and
[play](./src/internal/play/).

## Field values

### Upstream requests

| Source          | Operations                                                                           |
| --------------- | ------------------------------------------------------------------------------------ |
| `api`           | `proxy`                                                                              |
| `telemetry`     | `proxy`                                                                              |
| `shared_assets` | `proxy`                                                                              |
| `content`       | `proxy`, `html_fallback`, `english_asset_fallback`, `not_found_page`, `search_index` |
| `advertising`   | `sidedoor`, `placement`, `click`, `view`, `image`                                    |

`outcome` is one of:

- `success`: the upstream response has a status below 400 and the measured body
  handling completes, including upstream redirects.
- `http_error`: the upstream returns HTTP 400 or higher. An upstream 404 can
  lead to a successful fallback response to the client.
- `error`: another transport or response-consumption failure occurs.
- `timeout`: a proxy timeout or recognized fetch timeout occurs.
- `aborted`: the request or response is aborted, including a client disconnect
  before the upstream attempt completes.

`status` is the upstream HTTP status when available. On redirect and rejection
events, it is the selected client response status. `error_outcome` is one of
`error`, `timeout`, or `aborted`. `error_type` is an allowlisted built-in error
name, or `unknown`.

### Routes and formats

Path classification returns `live_sample`, `runner`, `api`, `telemetry`,
`advertising`, `shared_assets`, `static_asset`, `search_index`, `docs`, `blog`,
`curriculum`, or `other`. `other` means the path did not match a known category.
Some handlers supply the more specific `attachment`, `advertising_click`, or
`advertising_image` categories.

Where request context is included, paths ending in `/index.json` also receive
`format: "index_json"`, while retaining their route category. For example, a
docs JSON request has `route: "docs"` and `format: "index_json"`. The format
field describes the requested path, not the MIME type of the final response. It
is omitted for other paths. Query parameters are ignored when classifying paths.

`locale` is included only for upstream search-index loads and is normalized to a
supported locale.

### Fallbacks, redirects, and rejections

Content fallback `decision` values are `original_404`, `index_html`,
`localized_404`, `english_asset`, `english_404`, and `plain_404`. Decision
events describe the selected action; a later fetch or handler can still fail.

Redirect `reason` values are `leading_slash`, `canonical`, `missing_locale`,
`locale_casing`, `preferred_locale`, `trailing_slash`, `moved_page`,
`fundamental`, `production_asset_fallback`, `search_exact_match`,
`search_full_text`, and `advertising_click`. The redirect helper defaults to
`normalization` when no specific reason is supplied.

Rejection `reason` values are `origin`, `missing_referer`, `disallowed_referer`,
`missing_code`, `invalid_code`, `invalid_src`, `content_type`, `missing_state`,
`invalid_state`, `fetch_destination`, and `referer`.

## Latency and error handling

`duration_ms` uses a monotonic clock and is rounded to whole milliseconds.
Timing starts when a fetch is sent or the proxy emits its outgoing request
event. It ends after the response body is available to the consumer, or when the
attempt fails:

- Buffered content and shared-assets proxies finish timing when the response
  interceptor receives the decoded body, before content fallback processing
  begins. Bodyless responses finish timing at the upstream end event.
- Streaming API and telemetry proxies finish timing at the upstream response's
  end event.
- Fetches finish timing after body consumption, including JSON decoding where
  applicable. Previously unused bodies are drained without retaining them. Drain
  failures are measured without changing the caller's existing response
  decision; draining can delay fallback or redirect completion.

Each fallback fetch has its own upstream measurement. One incoming request can
produce multiple upstream records, so their count is not a count of client
requests. Cached 404 pages and search indexes produce no new upstream record on
a cache hit. Existing timeout policies are preserved.

Errors handled locally are logged because they do not reach the Sentry wrapper.
Middleware exceptions and rejected handler promises reach the router completion
callback, which logs `request_error`. Router dispatch returns before
asynchronous middleware completes, so these failures do not reject the main
handler's promise and are not captured by the Sentry wrapper.

The main handler's defensive catch rethrows exceptions for Sentry and logs them
locally only when `SENTRY_DSN` is disabled. An upstream outcome measurement can
accompany a Sentry exception; it contains categories and measurements rather
than serialized exception details.

## Privacy and coverage

Context contains bounded categories, statuses, and measurements. Do not log full
URLs, query values, cookies, authorization headers, secrets, request bodies,
referer values, user agents, or raw error messages/stacks.

These events cover deployed runtime paths. Local development/build scripts,
tests, generated browser code, and dependency/framework logs are outside this
catalog. There are no generic request-start or successful request-completion
events, and no request ID or trace field is added by the helper. Requests served
entirely by Cloud CDN do not execute this runtime. The catalog does not imply
that every HTTP 4xx response has a rejection event; routine method checks and
unmatched routes are not individually logged.

## Cloud Logging queries

Select the desired project, service, and time range in Logs Explorer, then use
the following filters. See the
[Logging query language](https://docs.cloud.google.com/logging/docs/view/logging-query-language)
reference for syntax.

Content proxy outcomes and latency for docs JSON requests:

```text
jsonPayload.event="upstream_request"
jsonPayload.context.source="content"
jsonPayload.context.operation="proxy"
jsonPayload.context.route="docs"
jsonPayload.context.format="index_json"
```

Upstream timeouts:

```text
jsonPayload.event="upstream_request"
jsonPayload.context.outcome="timeout"
```

Production redirects after a missing review asset:

```text
jsonPayload.event="redirect"
jsonPayload.context.reason="production_asset_fallback"
```

Runtime errors from this catalog:

```text
jsonPayload.event:*
severity>=ERROR
```
