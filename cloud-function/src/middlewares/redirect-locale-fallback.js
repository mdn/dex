/** @import { NextFunction, Request, Response } from "express" */

import { CANONICALS } from "../canonicals.js";
import { DEFAULT_LOCALE, VALID_LOCALES } from "../internal/constants/index.js";
import { getLocale } from "../internal/locale-utils/index.js";
import { getLocalesWithPath, normalizePath, redirect } from "../utils.js";

/**
 * Middleware that uses CANONICALS to redirect requests where the locale is
 * missing or where the requested locale doesn't have the page but en-US does.
 *
 * Runs after `redirectLocale`, which has already covered casing fixes and the
 * `NEEDS_LOCALE` allowlist of dynamic prefixes (`/search`, `/settings`, etc.).
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function redirectLocaleFallback(req, res, next) {
  const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  const requestURI = url.pathname;
  const qs = url.search;

  const uriParts = requestURI.split("/");
  const uriFirstPart = uriParts[1] ?? "";
  const rest = uriParts.slice(2).filter(Boolean).join("/");

  // Step 1: first segment is a valid locale.
  if (VALID_LOCALES.has(uriFirstPart.toLowerCase())) {
    if (CANONICALS[normalizePath(requestURI)]) {
      return next();
    }
    if (uriFirstPart !== DEFAULT_LOCALE) {
      const enCanonical =
        CANONICALS[normalizePath(`/${DEFAULT_LOCALE}/${rest}`)];
      if (enCanonical) {
        return redirect(res, enCanonical + qs);
      }
    }
    return next();
  }

  // Step 2: first segment is not a valid locale.

  // 2.a: treat first segment as an unsupported locale (only when there's a rest).
  if (rest) {
    const enCanonical = CANONICALS[normalizePath(`/${DEFAULT_LOCALE}/${rest}`)];
    if (enCanonical) {
      return redirect(res, enCanonical + qs);
    }
  }

  // 2.b: treat the whole path as a slug missing its locale prefix.
  const path = requestURI.replace(/\/$/, "") || "/";
  const fullEnCanonical =
    CANONICALS[normalizePath(`/${DEFAULT_LOCALE}${path === "/" ? "" : path}`)];
  if (fullEnCanonical) {
    const locales = getLocalesWithPath(path);
    const locale = getLocale(req, {
      locales: locales.length > 0 ? locales : VALID_LOCALES,
    });
    const target =
      CANONICALS[normalizePath(`/${locale}${path}`)] ?? fullEnCanonical;
    return redirect(res, target + qs);
  }

  next();
}
