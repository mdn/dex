/** @import { Request } from "express" */

import { parse } from "cookie";
import acceptLanguageParser from "accept-language-parser";

import {
  DEFAULT_LOCALE,
  VALID_LOCALES,
  PREFERRED_LOCALE_COOKIE_NAME,
} from "../constants/index.js";

/**
 * From https://github.com/aws-samples/cloudfront-authorization-at-edge/blob/01c1bc843d478977005bde86f5834ce76c479eec/src/lambda-edge/shared/shared.ts#L216
 * but rewritten in JavaScript (from TypeScript).
 * @param {{ cookie?: any }} headers
 * @returns {Record<string, string>}
 */
function extractCookiesFromHeaders(headers) {
  let value = headers["cookie"];

  // Cookies are present in the HTTP header "Cookie" that may be present multiple times.
  // This utility function parses occurrences  of that header and splits out all the cookies and their values
  // A simple object is returned that allows easy access by cookie name: e.g. cookies["nonce"]
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    // Express.
    value = [
      {
        value,
      },
    ];
  }

  // eslint-disable-next-line unicorn/no-array-reduce
  const cookies = value.reduce(
    /**
     * @param {Record<string, string>} reduced
     * @param {{ value: string }} header
     */
    (reduced, header) =>
      Object.assign(reduced, parse(header.value)),
    /** @type {Record<string, string>} */ ({})
  );

  return cookies;
}

/**
 * @param {Request} request
 * @param {string} cookieKey
 * @returns {string | undefined}
 */
function getCookie(request, cookieKey) {
  return extractCookiesFromHeaders(request.headers)[cookieKey];
}

/**
 * @param {Request} request
 * @returns {string | null}
 */
function getAcceptLanguage(request) {
  const acceptLangHeaders = request.headers["accept-language"];

  if (typeof acceptLangHeaders === "string") {
    // Express.
    return acceptLangHeaders;
  }

  const { value = null } = (acceptLangHeaders && acceptLangHeaders[0]) || {};
  return value;
}

/**
 * @param {Request} request
 * @param {object} options
 * @param {string} [options.fallback]
 * @param {Map<string, string> | Iterable<string>} [options.locales] - Optional set of valid locales to choose from (defaults to VALID_LOCALES)
 * @returns {string}
 */
export function getLocale(request, { fallback = DEFAULT_LOCALE, locales = VALID_LOCALES}) {
  const validLocalesMap = locales instanceof Map ? locales : new Map([...locales].map(l => [l.toLowerCase(), l]));
  const validLocalesList = [...validLocalesMap.values()];

  // First try by cookie.
  const cookieLocale = getCookie(request, PREFERRED_LOCALE_COOKIE_NAME);
  if (
    cookieLocale && // If it's valid, stick to it.
    validLocalesMap.has(cookieLocale.toLowerCase())
  ) {
    return /** @type {string} */ (validLocalesMap.get(cookieLocale.toLowerCase()));
  }

  // Each header in request.headers is always a list of objects.
  const value = getAcceptLanguage(request);
  const locale =
    value &&
    acceptLanguageParser.pick(validLocalesList, value, { loose: true });
  return locale || fallback;
}

/**
 * @param {any} locale
 * @returns {boolean}
 */
export function isValidLocale(locale) {
  return typeof locale === "string" && VALID_LOCALES.has(locale.toLowerCase());
}
