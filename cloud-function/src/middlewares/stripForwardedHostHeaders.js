/** @import { NextFunction, Request, Response } from "express" */

// Don't strip other `X-Forwarded-*` headers.
const HEADER_REGEXP = /^(x-forwarded-host|forwarded)$/i;

/**
 * Middleware that strips X-Forwarded-Host and Forwarded headers from requests.
 * Other X-Forwarded-* headers are left intact.
 * @param {Request} req - Express request
 * @param {Response} _res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function stripForwardedHostHeaders(req, _res, next) {
  Object.keys(req.headers)
    .filter((name) => HEADER_REGEXP.test(name))
    .forEach((name) => delete req.headers[name]);
  next();
}
