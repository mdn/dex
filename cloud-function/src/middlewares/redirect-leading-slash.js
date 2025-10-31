/** @import { NextFunction, Request, Response } from "express" */

import { redirect } from "../utils.js";

// If the URL was something like `https://domain/en-US/search/`, our code
// would make a that a redirect to `/en-US/search` (stripping the trailing slash).
// But if it was `https://domain//en-US/search/` it *would* make a redirect
// to `//en-US/search`.
// However, if pathname starts with `//` the Location header might look
// relative but it's actually an absolute URL.
// A 302 redirect from `https://domain//evil.com/` actually ends open
// opening `https://evil.com/` in the browser, because the browser will
// treat `//evil.com/ == https://evil.com/`.
// Prevent any pathnames that start with a double //.
// This essentially means that a request for `GET /////anything` becomes
// 302 with `Location: /anything`.

/**
 * Middleware that prevents security issues from multiple leading slashes.
 * Normalizes pathnames that start with multiple slashes to a single slash.
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function redirectLeadingSlash(req, res, next) {
  const pathname = req.url;
  const normalizedPathname = normalizeLeadingSlash(pathname);
  if (pathname !== normalizedPathname) {
    return redirect(res, normalizedPathname);
  }

  next();
}

/**
 * Normalizes multiple leading slashes to a single slash.
 * @param {string} pathname - The pathname to normalize
 * @returns {string} The normalized pathname
 */
function normalizeLeadingSlash(pathname) {
  return pathname.replace(/^(\/|%2f)+/i, "/");
}
