import {
  createProxyMiddleware,
  fixRequestBody,
  responseInterceptor,
} from "http-proxy-middleware";

import { withContentResponseHeaders } from "../headers.js";
import { REVIEW_ROUTING, Source, sourceUri } from "../env.js";
import { PROXY_TIMEOUT } from "../constants.js";
import { isLiveSampleURL } from "../utils.js";
import { ACTIVE_LOCALES } from "../internal/constants/index.js";
import {
  completeProxyResponse,
  fetchUpstream,
  log,
  requestContext,
  upstreamLoggingPlugin,
} from "../logging.js";

/** @type {Record<string, Promise<ArrayBuffer>>} */
const notFoundBufferCache = {};

const target = sourceUri(Source.content);

/**
 * Router function that handles wildcard subdomain targeting
 * @param {import("http").IncomingMessage} req
 */
const router = (req) => {
  let actualTarget = target;

  if (REVIEW_ROUTING) {
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
    plugins: [upstreamLoggingPlugin("content", true)],
    on: {
      proxyReq: fixRequestBody,
      proxyRes: responseInterceptor(
        async (responseBuffer, proxyRes, req, res) => {
          completeProxyResponse(req, proxyRes);
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
      log("INFO", "content_fallback", "Keep upstream live sample 404", {
        decision: "original_404",
        route: "live_sample",
      });
      return null;
    }

    const html = await fetchUpstream(
      `${target}${req.url?.slice(1)}/index.html`,
      {
        source: "content",
        operation: "html_fallback",
        ...requestContext(req.url),
      },
      async (response) => {
        if (!response.ok) {
          return null;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        return Buffer.from(await response.arrayBuffer());
      }
    );

    if (html) {
      log("INFO", "content_fallback", "Serve index HTML after upstream 404", {
        decision: "index_html",
        ...requestContext(req.url),
      });
      return html;
    }

    log("INFO", "content_fallback", "Serve localized 404 page", {
      decision: "localized_404",
      ...requestContext(req.url),
    });
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
      log("INFO", "content_fallback", "Keep upstream asset 404", {
        decision: "original_404",
        route: "attachment",
      });
      return null;
    }

    const asset = await fetchUpstream(
      `${target}${req.url?.slice(1).replace(locale, "en-us")}`,
      {
        source: "content",
        operation: "english_asset_fallback",
        route: "attachment",
      },
      async (response) => {
        if (!response.ok) {
          return null;
        }
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        return Buffer.from(await response.arrayBuffer());
      }
    );

    if (asset) {
      log("INFO", "content_fallback", "Serve English asset", {
        decision: "english_asset",
        route: "attachment",
      });
      return asset;
    }

    if (REVIEW_ROUTING) {
      // Fallback to prod.
      const prodUrl = new URL(req.url ?? "", "https://developer.mozilla.org/");
      res.statusCode = 303;
      res.setHeader("location", prodUrl.toString());
      log("INFO", "redirect", "Redirect missing review asset to production", {
        reason: "production_asset_fallback",
        status: 303,
        route: "attachment",
      });
      return "";
    }

    log(
      "INFO",
      "content_fallback",
      "Keep upstream asset 404 after English fallback",
      { decision: "original_404", route: "attachment" }
    );
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
    const { response, body } = await fetchUpstream(
      `${target}${locale}/404/index.html`,
      { source: "content", operation: "not_found_page" },
      async (response) => {
        if (!REVIEW_ROUTING && !response.ok) {
          return { response, body: null };
        }
        const body = response.arrayBuffer();
        if (!REVIEW_ROUTING) {
          notFoundBufferCache[locale] = body;
        }
        return { response, body: await body };
      }
    );
    if (!REVIEW_ROUTING && !response.ok) {
      log("WARNING", "content_fallback", "Localized 404 page unavailable", {
        decision: locale === "en-us" ? "plain_404" : "english_404",
        status: response.status,
      });
      return locale === "en-us" ? "not found" : get404ForLocale("en-us");
    }
    notFoundBuffer = Promise.resolve(/** @type {ArrayBuffer} */ (body));
  }

  return Buffer.from(await notFoundBuffer);
}
