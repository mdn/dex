/** @import { NextFunction, Request, Response } from "express" */

import { getLocale } from "../internal/locale-utils/index.js";
import { VALID_LOCALES } from "../internal/constants/index.js";
import { redirect, normalizePath } from "../utils.js";
import { CANONICALS } from "../canonicals.js";

const NEEDS_LOCALE =
  /^\/(?:blog|curriculum|docs|play|search|settings|plus)(?:$|\/)/;

/**
 * Finds all locales where a given path (without locale) is available.
 * @param {string} path - The path without locale prefix (e.g., "/docs/Web/API")
 * @returns {string[]} Array of locale codes where the page exists
 */
function getLocalesWithPath(path) {
  return [...VALID_LOCALES.values()].filter(locale => CANONICALS[normalizePath(`/${locale}${path}`)]);
}

/**
 * Middleware that handles locale-related redirects.
 * Inserts missing locales and corrects locale casing.
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function redirectLocale(req, res, next) {
  const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  const requestURI = url.pathname;
  const requestURILowerCase = requestURI.toLowerCase();
  const qs = url.search;

  // Do we need to insert the locale? If we do, trim a trailing slash
  // to avoid a double redirect, except when requesting the home page.
  if (
    requestURI === "" ||
    requestURI === "/" ||
    NEEDS_LOCALE.test(requestURILowerCase)
  ) {
    const path = requestURI.endsWith("/")
      ? requestURI.slice(0, -1)
      : requestURI;

    const locales = getLocalesWithPath(path || "/");

    // Note that "getLocale" only returns valid locales, never a retired locale.
    const locale = getLocale(req, { locales: locales.length > 0 ? locales : VALID_LOCALES });

    // The only time we actually want a trailing slash is when the URL is just
    // the locale. E.g. `/en-US/` (not `/en-US`)
    return redirect(res, `/${locale}${path || "/"}` + qs);
  }

  // At this point, the URI is guaranteed to start with a forward slash.
  const uriParts = requestURI.split("/");
  const uriFirstPart = uriParts[1] ?? "";
  const uriFirstPartLC = uriFirstPart.toLowerCase();

  // Do we need to redirect to the properly-cased locale? We also ensure
  // here that requests for the home page have a trailing slash, while
  // all others do not.
  if (
    VALID_LOCALES.has(uriFirstPartLC) &&
    uriFirstPart !== VALID_LOCALES.get(uriFirstPartLC)
  ) {
    // Assemble the rest of the path without a trailing slash.
    const extra = uriParts.slice(2).filter(Boolean).join("/");
    return redirect(res, `/${VALID_LOCALES.get(uriFirstPartLC)}/${extra}${qs}`);
  }

  next();
}
