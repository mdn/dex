/** @import { NextFunction, Request, Response } from "express" */

/**
 * Middleware that lowercases the pathname of the request URL.
 * Also updates originalUrl to support http-proxy-middleware v2.
 * @param {Request} req - Express request
 * @param {Response} _res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function lowercasePathname(req, _res, next) {
  const urlParsed = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  if (urlParsed.pathname) {
    urlParsed.pathname = urlParsed.pathname.toLowerCase();
    req.url = urlParsed.toString();
    // Workaround for http-proxy-middleware v2 using `req.originalUrl`.
    // See: https://github.com/chimurai/http-proxy-middleware/pull/731
    req.originalUrl = req.url;
  }
  next();
}
