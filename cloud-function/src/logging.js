/** @import { IncomingMessage } from "node:http" */

import { performance } from "node:perf_hooks";

/**
 * @typedef {"success" | "http_error" | "error" | "timeout" | "aborted"} Outcome
 * @typedef {Record<string, string | number | boolean | undefined>} Context
 */

/**
 * Context must contain categories and measurements, never request data or errors.
 * @param {"INFO" | "WARNING" | "ERROR"} severity
 * @param {string} event
 * @param {string} message
 * @param {Context} [context]
 */
export function log(severity, event, message, context = {}) {
  console.log(JSON.stringify({ severity, message, event, context }));
}

/** @param {string} [url] */
export function routeCategory(url = "") {
  const pathname = url.split("?", 1)[0] ?? "";
  if (pathname.includes("/_sample_.")) {
    return "live_sample";
  }
  if (pathname.endsWith("/runner.html")) {
    return "runner";
  }
  if (/^\/(api|admin-api|events|users)(\/|$)/.test(pathname)) {
    return "api";
  }
  if (pathname.startsWith("/submit/")) {
    return "telemetry";
  }
  if (/^\/(pong|pimg)\//.test(pathname)) {
    return "advertising";
  }
  if (pathname.startsWith("/shared-assets/")) {
    return "shared_assets";
  }
  if (/^\/(assets|static|sitemaps)\//.test(pathname)) {
    return "static_asset";
  }
  if (pathname.endsWith("/search-index.json")) {
    return "search_index";
  }
  if (/^\/(?:[^/]+\/)?docs(\/|$)/.test(pathname)) {
    return "docs";
  }
  if (/^\/(?:[^/]+\/)?blog(\/|$)/.test(pathname)) {
    return "blog";
  }
  if (/^\/(?:[^/]+\/)?curriculum(\/|$)/.test(pathname)) {
    return "curriculum";
  }
  return "other";
}

/** @param {string} [url] @returns {Context} */
export function requestContext(url = "") {
  const pathname = url.split("?", 1)[0] ?? "";
  return {
    route: routeCategory(url),
    format: pathname.endsWith("/index.json") ? "index_json" : undefined,
  };
}

/** @param {unknown} error @param {number} [depth] @returns {Outcome} */
export function errorOutcome(error, depth = 0) {
  if (error && typeof error === "object") {
    if ("name" in error && error.name === "AbortError") {
      return "aborted";
    }
    if ("name" in error && error.name === "TimeoutError") {
      return "timeout";
    }
    if (
      "code" in error &&
      [
        "ETIMEDOUT",
        "ESOCKETTIMEDOUT",
        "UND_ERR_CONNECT_TIMEOUT",
        "UND_ERR_HEADERS_TIMEOUT",
        "UND_ERR_BODY_TIMEOUT",
      ].includes(String(error.code))
    ) {
      return "timeout";
    }
    if ("cause" in error && depth < 3) {
      return errorOutcome(error.cause, depth + 1);
    }
  }
  return "error";
}

/** @param {unknown} error @returns {Context} */
export function errorContext(error) {
  const name =
    error && typeof error === "object" && "name" in error ? error.name : null;
  const errorType =
    typeof name === "string" &&
    [
      "Error",
      "TypeError",
      "SyntaxError",
      "RangeError",
      "URIError",
      "AbortError",
      "TimeoutError",
    ].includes(name)
      ? name
      : "unknown";
  return { error_type: errorType, error_outcome: errorOutcome(error) };
}

/**
 * @param {Context} context
 * @returns {(outcome: Outcome, status?: number) => void}
 */
export function startUpstream(context) {
  const started = performance.now();
  let completed = false;
  return (outcome, status) => {
    if (completed) {
      return;
    }
    completed = true;
    log(
      outcome === "success" ? "INFO" : "WARNING",
      "upstream_request",
      "Upstream request completed",
      {
        ...context,
        outcome,
        status,
        duration_ms: Math.round(performance.now() - started),
      }
    );
  };
}

/**
 * @template T
 * @param {string | URL} input
 * @param {Context} context
 * @param {(response: Response) => Promise<T>} consume
 * @param {RequestInit} [init]
 * @returns {Promise<T>}
 */
export async function fetchUpstream(input, context, consume, init) {
  const complete = startUpstream(context);
  let response;
  try {
    response = await fetch(input, init);
    let result;
    try {
      result = await consume(response);
    } finally {
      // Header-only callers still measure the body without retaining it.
      if (!response.bodyUsed && response.body) {
        try {
          await response.body.pipeTo(new WritableStream());
        } catch (error) {
          complete(errorOutcome(error), response.status);
        }
      }
    }
    complete(
      response.ok || response.status < 400 ? "success" : "http_error",
      response.status
    );
    return result;
  } catch (error) {
    const outcome = errorOutcome(error);
    complete(
      outcome === "error" && response && response.status >= 400
        ? "http_error"
        : outcome,
      response?.status
    );
    throw error;
  }
}

/**
 * @typedef {{ complete: ReturnType<typeof startUpstream>, status?: number | undefined, timedOut: boolean }} ProxyTiming
 */
/** @type {WeakMap<IncomingMessage, ProxyTiming>} */
const proxyTimings = new WeakMap();

/** @param {IncomingMessage} req @param {IncomingMessage} response */
export function completeProxyResponse(req, response) {
  proxyTimings
    .get(req)
    ?.complete(
      (response.statusCode ?? 0) < 400 ? "success" : "http_error",
      response.statusCode
    );
}

/**
 * Observe proxy events without replacing the library's error handlers.
 * @param {string} source
 * @param {boolean} [buffered]
 * @returns {import("http-proxy-middleware").Plugin}
 */
export function upstreamLoggingPlugin(source, buffered = false) {
  return (proxy) => {
    proxy.on("proxyReq", (proxyReq, req, res) => {
      const timing = {
        complete: startUpstream({
          source,
          operation: "proxy",
          ...requestContext(req.url),
        }),
        timedOut: false,
      };
      proxyTimings.set(req, timing);
      proxyReq.once("timeout", () => {
        timing.timedOut = true;
        timing.complete("timeout", proxyTimings.get(req)?.status);
      });
      res.once("close", () => {
        if (!res.writableFinished) {
          timing.complete("aborted", proxyTimings.get(req)?.status);
        }
      });
      res.once("finish", () => {
        // Interceptor failures can finish without delivering a decoded body.
        if (buffered) {
          timing.complete("error", proxyTimings.get(req)?.status);
        }
      });
    });
    proxy.on("proxyRes", (response, req) => {
      const timing = proxyTimings.get(req);
      if (!timing) {
        return;
      }
      timing.status = response.statusCode;
      response.once("error", (error) =>
        timing.complete(errorOutcome(error), response.statusCode)
      );
      response.once("aborted", () =>
        timing.complete("aborted", response.statusCode)
      );
      response.once("end", () => {
        if (
          !buffered ||
          req.method === "HEAD" ||
          response.statusCode === 204 ||
          response.statusCode === 304 ||
          (response.statusCode ?? 0) < 200
        ) {
          completeProxyResponse(req, response);
        }
      });
    });
    const failed = (
      /** @type {Error} */ error,
      /** @type {IncomingMessage | undefined} */ req
    ) => {
      if (!req) {
        return;
      }
      const timing = proxyTimings.get(req);
      timing?.complete(
        timing.timedOut ? "timeout" : errorOutcome(error),
        timing.status
      );
    };
    proxy.on("error", failed);
    proxy.on("econnreset", failed);
  };
}
