/** @import { Request, Response } from "express" */

import { BSA_ENABLED } from "../env.js";
import { proxyBSA } from "./proxy-bsa.js";
import { proxyKevel } from "./proxy-kevel.js";

/**
 * Routes pong/advertising requests to either BSA or Kevel handler
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<Response | void>}
 */
export async function proxyPong(req, res) {
  if (BSA_ENABLED) {
    return proxyBSA(req, res);
  }
  return proxyKevel(req, res);
}
