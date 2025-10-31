/** @import { NextFunction, Request, Response } from "express" */
/** @import { OriginType } from "../env.js" */

import { WILDCARD_ENABLED, getOriginFromRequest } from "../env.js";

/**
 * Creates a middleware that requires the request to come from one of the expected origins.
 * Returns 404 if the origin doesn't match (unless WILDCARD_ENABLED is true).
 * @param {...OriginType} expectedOrigins - The allowed origin types
 * @returns {(req: Request, res: Response, next: NextFunction) => void} Express middleware function
 */
export function requireOrigin(...expectedOrigins) {
  return async (req, res, next) => {
    if (WILDCARD_ENABLED) {
      return next();
    }

    const actualOrigin = getOriginFromRequest(req);

    if (expectedOrigins.includes(actualOrigin)) {
      return next();
    } else {
      return res.sendStatus(404).end();
    }
  };
}
