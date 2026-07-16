/** @import { NextFunction, Request, Response } from "express" */

import { THIRTY_DAYS } from "../constants.js";
import { VALID_LOCALES } from "../internal/constants/index.js";
import { redirect } from "../utils.js";

// Note that the keys of "VALID_LOCALES" are lowercase locales.
const LOCALE_URI_WITHOUT_TRAILING_SLASH = new Set(
  [...VALID_LOCALES.keys()].map((locale) => `/${locale}`)
);
const LOCALE_URI_WITH_TRAILING_SLASH = new Set(
  [...VALID_LOCALES.keys()].map((locale) => `/${locale}/`)
);
// TODO: The code that uses LEGACY_URI_NEEDING_TRAILING_SLASH should be
//       temporary. For example, when we have moved to the Dex-built
//       account settings page, we should add fundamental redirects
//       for "/{locale}/account/?" and "/account/?" that redirect to
//       "/{locale}/settings" and "/settings" respectively. The other
//       cases can be either redirected or deleted eventually as well.
//       The goal is to eventually remove the code that uses
//       LEGACY_URI_NEEDING_TRAILING_SLASH.
const LEGACY_URI_NEEDING_TRAILING_SLASH = new RegExp(
  `^(?:${[...LOCALE_URI_WITHOUT_TRAILING_SLASH].join(
    "|"
  )})?/(?:account|contribute|maintenance-mode|payments)/?$`
);

/**
 * Middleware that handles trailing slash redirects.
 * Home pages require trailing slashes, all other pages should not have them.
 * Special handling for locale home pages and legacy URIs.
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function redirectTrailingSlash(req, res, next) {
  const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  let requestURI = url.pathname;
  const requestURILowerCase = requestURI.toLowerCase();
  const qs = url.search;

  // Handle cases related to the presence or absence of a trailing-slash.
  if (LOCALE_URI_WITHOUT_TRAILING_SLASH.has(requestURILowerCase)) {
    // Locale home pages are the special case on MDN: they must have a
    // trailing slash, so redirect e.g. /en-US to /en-US/.
    return redirect(res, requestURI + "/" + qs, {
      cacheControlSeconds: THIRTY_DAYS,
    });
  } else if (
    requestURI.endsWith("/") &&
    !LOCALE_URI_WITH_TRAILING_SLASH.has(requestURILowerCase) &&
    !LEGACY_URI_NEEDING_TRAILING_SLASH.test(requestURILowerCase)
  ) {
    // All other requests with a trailing slash should redirect to the
    // same URL without the trailing slash.
    return redirect(res, requestURI.slice(0, -1) + qs, {
      cacheControlSeconds: THIRTY_DAYS,
    });
  }

  next();
}
