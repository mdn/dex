/** @import { Request, Response } from "express" */

/**
 * Final router callback, so that errors still produce a response.
 * Without it, the request stays open until the function times out.
 * @param {unknown} err - Error passed to `next`, if any
 * @param {Request} _req - Express request
 * @param {Response} res - Express response
 * @returns {void}
 */
export function handleError(err, _req, res) {
  if (res.headersSent) {
    console.error(err);
    // Let ended responses flush; abort incomplete responses on error.
    if (!res.writableEnded) {
      res.destroy();
    }
    return;
  }

  const status = err === undefined ? 404 : statusOf(err);
  if (status >= 500) {
    console.error(err);
  }
  res.set("Cache-Control", "no-store").sendStatus(status);
}

/**
 * @param {unknown} err
 * @returns {number}
 */
function statusOf(err) {
  // Thrown by `decodeURIComponent` for malformed percent-encoding.
  if (err instanceof URIError) {
    return 400;
  }
  const status =
    err && typeof err === "object"
      ? (Reflect.get(err, "status") ?? Reflect.get(err, "statusCode"))
      : undefined;
  return Number.isInteger(status) && status >= 400 && status < 600
    ? status
    : 500;
}
