/** @import { NextFunction, Request, Response } from "express" */

// `.` and `..`, also percent-encoded, which URL parsers resolve like the plain form.
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * Middleware that rejects paths with dot segments or backslashes.
 * Handlers build upstream URLs from the request path, and URL parsers resolve
 * these, so they could otherwise address objects outside the content prefix.
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function rejectDotSegments(req, res, next) {
  const [pathname = ""] = req.url.split("?", 1);
  if (
    pathname.includes("\\") ||
    // Servers pass a raw `#` through as path, but URL parsers start a fragment there.
    pathname.split(/[/#]/).some((segment) => DOT_SEGMENT.test(segment))
  ) {
    res.sendStatus(400).end();
    return;
  }

  next();
}
