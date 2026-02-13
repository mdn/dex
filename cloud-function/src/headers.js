/** @import { IncomingMessage, ServerResponse } from "node:http" */

import { CSP_VALUE } from "./internal/constants/index.js";
import { isLiveSampleURL } from "./utils.js";
import { WILDCARD_ENABLED } from "./env.js";

const HASHED_MAX_AGE = 60 * 60 * 24 * 365;
const DEFAULT_MAX_AGE = 60 * 60;

const NO_CACHE_VALUE = "no-store";

const HASHED_REGEX = /\.[a-f0-9]{8,32}\./;

/**
 * Add content response headers to a proxy response
 * @param {IncomingMessage} proxyRes - Proxy response
 * @param {IncomingMessage} req - Request object
 * @param {ServerResponse<IncomingMessage>} res - Response object
 * @returns {ServerResponse<IncomingMessage>} Response object with headers
 */
export function withContentResponseHeaders(proxyRes, req, res) {
  if (res.headersSent) {
    console.warn(
      `Cannot set content response headers. Headers already sent for: ${req.url}`
    );
    return res;
  }

  const url = req.url ?? "";

  const isLiveSample = isLiveSampleURL(url);

  setContentResponseHeaders((name, value) => res.setHeader(name, value), {
    csp:
      !isLiveSample &&
      parseContentType(proxyRes.headers["content-type"]).startsWith(
        "text/html"
      ),
    xFrame: !isLiveSample,
  });

  if (req.url?.endsWith("/contributors.txt")) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }

  if (res.statusCode === 200 && req.url?.endsWith("/sitemap.xml.gz")) {
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Encoding", "gzip");
  }

  const cacheControl = getCacheControl(proxyRes.statusCode ?? 0, url);
  if (cacheControl) {
    res.setHeader("Cache-Control", cacheControl);
  }

  return res;
}

/**
 * Get cache control header value based on status code and URL
 * @param {number} statusCode - HTTP status code
 * @param {string} url - Request URL
 * @returns {string | null} Cache control value
 */
function getCacheControl(statusCode, url) {
  if (
    statusCode === 404 ||
    url.endsWith("/service-worker.js") ||
    url.includes("/_whatsdeployed/")
  ) {
    return NO_CACHE_VALUE;
  }

  if (200 <= statusCode && statusCode < 300) {
    if (WILDCARD_ENABLED && !HASHED_REGEX.test(url)) {
      return NO_CACHE_VALUE;
    }

    const maxAge = getCacheMaxAgeForUrl(url);
    return `public, max-age=${maxAge}`;
  }

  return null;
}

/**
 * Get cache max age for a URL
 * @param {string} url - Request URL
 * @returns {number} Max age in seconds
 */
function getCacheMaxAgeForUrl(url) {
  const isHashed = HASHED_REGEX.test(url);
  const maxAge = isHashed ? HASHED_MAX_AGE : DEFAULT_MAX_AGE;

  return maxAge;
}

/**
 * Parse content type from header value
 * @param {unknown} value - Content type header value
 * @returns {string} Parsed content type
 */
function parseContentType(value) {
  const firstValue = Array.isArray(value) ? (value[0] ?? "") : value;

  return typeof firstValue === "string" ? firstValue : "";
}

/**
 * Set content response headers using a setter function
 * @param {(name: string, value: string) => void} setHeader - Header setter function
 * @param {object} options - Header options
 * @param {boolean} [options.csp=true] - Whether to set CSP header
 * @param {boolean} [options.xFrame=true] - Whether to set X-Frame-Options header
 * @returns {void}
 */
export function setContentResponseHeaders(
  setHeader,
  { csp = true, xFrame = true } = {}
) {
  [
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["X-Content-Type-Options", "nosniff"],
    ["Strict-Transport-Security", "max-age=63072000"],
    ...(csp ? [["Content-Security-Policy", CSP_VALUE]] : []),
    ...(xFrame ? [["X-Frame-Options", "DENY"]] : []),
  ].forEach(([k, v]) => k && v && setHeader(k, v));
}
