/** @import { NextFunction, Request, Response } from "express" */

/**
 * Middleware that lowercases the pathname of the request URL.
 * @param {Request} req - Express request
 * @param {Response} _res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function lowercasePathname(req, _res, next) {
  const urlParsed = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  if (urlParsed.pathname) {
    urlParsed.pathname = urlParsed.pathname.toLowerCase();
    req.url = urlParsed.pathname + urlParsed.search + urlParsed.hash;
  }
  next();
}
