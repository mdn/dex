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
 * Creates a content proxy middleware with custom response handling
 * @param {Parameters<typeof responseInterceptor>[0]} interceptor
 */
const createContentProxyMiddleware = (interceptor) =>
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
          return interceptor(responseBuffer, proxyRes, req, res);
        }
      ),
    },
  });

/**
 * Proxy middleware for content requests
 * Handles MDN content with 404 fallback logic and wildcard subdomain support
 */
export const proxyContent = createContentProxyMiddleware(
  async (responseBuffer, proxyRes, req, res) => {
    const { target } = req.headers;

    if (proxyRes.statusCode === 404 && !isLiveSampleURL(req.url ?? "")) {
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

    return responseBuffer;
  }
);

/**
 * Proxy middleware for content assets (attachments, media, fonts)
 * Falls back to en-US assets for non-English locales, then to production if needed
 */
export const proxyContentAssets = createContentProxyMiddleware(
  async (responseBuffer, proxyRes, req, res) => {
    const { target } = req.headers;

    const [, locale] = req.url?.split("/") || [];
    if (
      proxyRes.statusCode === 404 &&
      locale &&
      locale != "en-US" &&
      ACTIVE_LOCALES.has(locale.toLowerCase())
    ) {
      const enUsAsset = await fetch(
        `${target}${req.url?.slice(1).replace(locale, "en-us")}`
      );
      if (enUsAsset?.ok) {
        res.statusCode = enUsAsset.status;
        enUsAsset.headers.forEach((value, key) => res.setHeader(key, value));
        return Buffer.from(await enUsAsset.arrayBuffer());
      } else if (WILDCARD_ENABLED) {
        // Fallback to prod.
        const prodUrl = new URL(
          req.url ?? "",
          "https://developer.mozilla.org/"
        );
        res.statusCode = 303;
        res.setHeader("location", prodUrl.toString());
        return "";
      }
    }

    return responseBuffer;
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
