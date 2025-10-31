/** @import { Request, Response } from "express" */

/**
 * Middleware that sends a 404 Not Found response.
 * @param {Request} _req - Express request
 * @param {Response} res - Express response
 * @returns {Promise<void>}
 */
export async function notFound(_req, res) {
  res.sendStatus(404).end();
}
