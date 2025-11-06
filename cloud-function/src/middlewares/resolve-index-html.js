/** @import { NextFunction, Request, Response } from "express" */

import * as path from "node:path";

import { slugToFolder } from "../internal/slug-utils/index.js";
import { isAsset } from "../utils.js";

/**
 * Middleware that resolves document URLs to index.html paths.
 * Converts URL slugs to folder paths and appends index.html for non-asset requests.
 * Also updates originalUrl to support http-proxy-middleware v2.
 * @param {Request} req - Express request
 * @param {Response} _res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function resolveIndexHTML(req, _res, next) {
  const urlParsed = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  if (urlParsed.pathname) {
    let pathname = slugToFolder(urlParsed.pathname);
    if (!isAsset(pathname)) {
      pathname = path.join(pathname, "index.html");
    }
    req.url = pathname; // e.g. "/en-us/docs/mozilla/add-ons/webextensions/browser_compatibility_for_manifest.json"
    // Workaround for http-proxy-middleware v2 using `req.originalUrl`.
    // See: https://github.com/chimurai/http-proxy-middleware/pull/731
    req.originalUrl = req.url;
  }
  next();
}
