/** @import { NextFunction, Request, Response } from "express" */

import { THIRTY_DAYS } from "../constants.js";
import { isAsset, redirect } from "../utils.js";

/**
 * Middleware that enforces trailing slashes on non-asset URLs.
 * Redirects URLs without trailing slashes to the same URL with a trailing slash.
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function redirectEnforceTrailingSlash(req, res, next) {
  const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  const requestURI = url.pathname;
  const qs = url.search;

  if (!requestURI.endsWith("/") && !isAsset(requestURI)) {
    // All other requests with a trailing slash should redirect to the
    // same URL without the trailing slash.
    return redirect(res, requestURI + "/" + qs, {
      cacheControlSeconds: THIRTY_DAYS,
    });
  }

  next();
}
