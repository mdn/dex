/** @import { Request, Response } from "express" */

import {
  ANY_ATTACHMENT_EXT,
  createRegExpFromExtensions,
} from "./internal/constants/index.js";

import { DEFAULT_COUNTRY } from "./constants.js";

/**
 * Get the country code from the request headers
 * @param {Request} req - Express request object
 * @returns {string} Two-letter country code
 */
export function getRequestCountry(req) {
  const value = req.headers["cloudfront-viewer-country"];

  if (typeof value === "string" && value !== "ZZ") {
    return value;
  } else {
    return DEFAULT_COUNTRY;
  }
}

/**
 * Send a redirect response with appropriate caching headers
 * @param {Response} res - Express response object
 * @param {string} location - Redirect location URL
 * @param {object} options - Redirect options
 * @param {number} [options.status=302] - HTTP status code
 * @param {number} [options.cacheControlSeconds=0] - Cache duration in seconds
 * @returns {void}
 */
export function redirect(
  res,
  location,
  { status = 302, cacheControlSeconds = 0 } = {}
) {
  let cacheControlValue;
  if (cacheControlSeconds) {
    cacheControlValue = `max-age=${cacheControlSeconds},public`;
  } else {
    cacheControlValue = "no-store";
  }

  // We need to URL encode the pathname, but leave the query string as is.
  // Suppose the old URL was `/search?q=text%2Dshadow` and all we need to do
  // is to inject the locale to that URL, we should not URL encode the whole
  // new URL otherwise you'd end up with `/en-US/search?q=text%252Dshadow`
  // since the already encoded `%2D` would become `%252D` which is wrong and
  // different.
  const [pathname, querystring] = location.split("?", 2);
  let newLocation = encodeURI(pathname || "");
  if (querystring) {
    newLocation += `?${querystring}`;
  }

  res.set("Cache-Control", cacheControlValue).redirect(status, newLocation);
}

/**
 * Check if a URL is a live sample URL
 * @param {string} url - URL to check
 * @returns {boolean} True if the URL contains '/_sample_.'
 */
export function isLiveSampleURL(url) {
  return url.includes("/_sample_.");
}

// These are the only extensions in client/build/*/docs/*.
// `find client/build -type f | grep docs | xargs basename | sed 's/.*\.\([^.]*\)$/\1/' | sort | uniq`
const TEXT_EXT = ["html", "json", "svg", "txt", "xml"];
const ANY_ATTACHMENT_REGEXP = createRegExpFromExtensions(
  ...ANY_ATTACHMENT_EXT,
  ...TEXT_EXT
);

/**
 * Check if a URL points to an asset file
 * @param {string} url - URL to check
 * @returns {boolean} True if the URL matches asset file extensions
 */
export function isAsset(url) {
  return ANY_ATTACHMENT_REGEXP.test(url);
}

/**
 * Normalize a path by lowercasing and removing trailing slash
 * @param {string} path - Path to normalize
 * @returns {string} Normalized path
 */
export function normalizePath(path) {
  return path.toLowerCase().replace(/\/$/, "");
}
