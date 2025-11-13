/** @import { Request, Response } from "express" */

import { proxyBSA } from "./proxy-bsa.js";

/**
 * Routes pong/advertising requests to BSA handler
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<Response | void>}
 */
export async function proxyPong(req, res) {
  return proxyBSA(req, res);
}
