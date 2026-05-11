/** @import { NextFunction, Request, Response } from "express" */

/**
 * Middleware that strips Content-Type header from requests.
 * Most requests don't require this header, only requests with a
 * request body do.
 * See: https://bugzilla.mozilla.org/show_bug.cgi?id=2038164
 *
 * @param {Request} req
 * @param {Response} _res
 * @param {NextFunction} next
 */
export async function stripContentTypeHeader(req, _res, next) {
  delete req.headers["content-type"];
  next();
}
