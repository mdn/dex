import {
  createProxyMiddleware,
  fixRequestBody,
  responseInterceptor,
} from "http-proxy-middleware";

import { withContentResponseHeaders } from "../headers.js";
import { Source, sourceUri, WILDCARD_ENABLED } from "../env.js";
import { PROXY_TIMEOUT } from "../constants.js";
import { isLiveSampleURL } from "../utils.js";
import { ACTIVE_LOCALES } from "../internal/constants/index.js";

/** @type {Record<string, Promise<ArrayBuffer>>} */
const notFoundBufferCache = {};

const target = sourceUri(Source.content);

/**
 * Router function that handles wildcard subdomain targeting
 * @param {import("http").IncomingMessage} req
 */
const router = (req) => {
  let actualTarget = target;

  if (WILDCARD_ENABLED) {
    const { host } = req.headers;

    if (typeof host === "string") {
      const subdomain = host.split(".")[0];
      actualTarget = `${target}${subdomain}/`;
    }
  }

  req.headers["target"] = actualTarget;

  return actualTarget;
};

/**
 * @typedef {object} NotFoundHandlerContext
 * @property {string} target - The resolved target path
 * @property {import("http").IncomingMessage} req
 * @property {import("http").ServerResponse} res
 */

/**
 * Creates a content proxy middleware with custom 404 handling
 * @param {(context: NotFoundHandlerContext) => Promise<Buffer | string | null>} handleNotFound
 *   Called when the upstream returns 404. Return replacement content, or null to use the original 404 response.
 */
const createContentProxyMiddleware = (handleNotFound) =>
  createProxyMiddleware({
    changeOrigin: true,
    autoRewrite: true,
    router,
    proxyTimeout: PROXY_TIMEOUT,
    xfwd: true,
    selfHandleResponse: true,
    on: {
      proxyReq: fixRequestBody,
      proxyRes: responseInterceptor(
        async (responseBuffer, proxyRes, req, res) => {
          withContentResponseHeaders(proxyRes, req, res);

          if (proxyRes.statusCode === 404) {
            const result = await handleNotFound({
              target: /** @type {string} */ (req.headers["target"]),
              req,
              res,
            });
            if (result != null) {
              return result;
            }
          }

          return responseBuffer;
        }
      ),
    },
  });

/**
 * Proxy middleware for content requests
 * Handles MDN content with 404 fallback logic and wildcard subdomain support
 */
export const proxyContent = createContentProxyMiddleware(
  async ({ target, req, res }) => {
    if (isLiveSampleURL(req.url ?? "")) {
      return null;
    }

    const tryHtml = await fetch(`${target}${req.url?.slice(1)}/index.html`);

    if (tryHtml.ok) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html");
      return Buffer.from(await tryHtml.arrayBuffer());
    }

    res.setHeader("Content-Type", "text/html");
    const locale = req.url?.match(/[^/]+/)?.[0] ?? "en-us";
    return get404ForLocale(locale);
  }
);

/**
 * Proxy middleware for content assets (attachments, media, fonts)
 * Falls back to en-US assets for non-English locales, then to production if needed
 */
export const proxyContentAssets = createContentProxyMiddleware(
  async ({ target, req, res }) => {
    const [, locale] = req.url?.split("/") || [];

    if (
      !locale ||
      locale === "en-US" ||
      !ACTIVE_LOCALES.has(locale.toLowerCase())
    ) {
      return null;
    }

    const enUsAsset = await fetch(
      `${target}${req.url?.slice(1).replace(locale, "en-us")}`
    );

    if (enUsAsset?.ok) {
      res.statusCode = enUsAsset.status;
      enUsAsset.headers.forEach((value, key) => res.setHeader(key, value));
      return Buffer.from(await enUsAsset.arrayBuffer());
    }

    if (WILDCARD_ENABLED) {
      // Fallback to prod.
      const prodUrl = new URL(req.url ?? "", "https://developer.mozilla.org/");
      res.statusCode = 303;
      res.setHeader("location", prodUrl.toString());
      return "";
    }

    return null;
  }
);

/**
 * Fetches the 404 page for a given locale with caching
 * @param {string} locale - The locale code (e.g., "en-us")
 * @returns {Promise<Buffer | string>} The 404 page content as a Buffer or fallback string
 */
async function get404ForLocale(locale) {
  /** @type {Promise<ArrayBuffer>} */
  let notFoundBuffer;
  if (notFoundBufferCache[locale]) {
    notFoundBuffer = notFoundBufferCache[locale];
  } else {
    const response = await fetch(`${target}${locale}/404/index.html`);
    notFoundBuffer = response.arrayBuffer();
    if (!WILDCARD_ENABLED) {
      if (response.ok) {
        notFoundBufferCache[locale] = notFoundBuffer;
      } else {
        return locale === "en-us" ? "not found" : get404ForLocale("en-us");
      }
    }
  }

  return Buffer.from(await notFoundBuffer);
}
