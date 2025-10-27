/** @import { NextFunction, Request, Response } from "express" */

import { normalizePath, redirect } from "../utils.js";
import { CANONICALS } from "../canonicals.js";

/**
 * Middleware that redirects to the user's preferred locale if available.
 * Checks the 'preferredlocale' cookie and redirects if the content exists in that locale.
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
export async function redirectPreferredLocale(req, res, next) {
  // Check 1: Does the user prefer a locale and has redirect enabled?

  const preferredLocale = req.cookies["preferredlocale"];

  if (!preferredLocale) {
    next();
    return;
  }

  // Check 2: Does the target have a different locale?

  const target = new URL(req.url, `${req.protocol}://${req.headers.host}`);
  const targetPathname = target.pathname;
  const [targetLocale, targetSlug] = localeAndSlugOf(target);

  if (targetLocale.toLowerCase() === preferredLocale.toLowerCase()) {
    next();
    return;
  }

  // Check 3: Does the target exist in the preferred locale?

  const preferredPathname =
    CANONICALS[normalizePath(`/${preferredLocale}/${targetSlug}`)] ?? null;
  if (preferredPathname && preferredPathname !== targetPathname) {
    const location = preferredPathname + target.search;
    return redirect(res, location);
  }

  next();
}

/**
 * Extracts the locale and slug from a URL.
 * @param {URL} url - The URL to parse
 * @returns {[string, string]} A tuple of [locale, slug]
 */
function localeAndSlugOf(url) {
  const locale = url.pathname.split("/").at(1) || "";
  const slug = url.pathname.split("/").slice(2).join("/");

  return [locale, slug];
}
