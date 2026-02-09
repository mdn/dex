/** @import { Request, Response } from "express" */

import cookieParser from "cookie-parser";
import express, { Router } from "express";

import { ANY_ATTACHMENT_EXT } from "./internal/constants/index.js";

import { Origin } from "./env.js";
import { proxyContent, proxyContentAssets } from "./handlers/proxy-content.js";
import { proxyApi } from "./handlers/proxy-api.js";
import { handleStripePlans } from "./handlers/handle-stripe-plans.js";
import { proxyTelemetry } from "./handlers/proxy-telemetry.js";
import { lowercasePathname } from "./middlewares/lowercase-pathname.js";
import { resolveIndexHTML } from "./middlewares/resolve-index-html.js";
import { redirectNonCanonicals } from "./middlewares/redirect-non-canonicals.js";
import { redirectLeadingSlash } from "./middlewares/redirect-leading-slash.js";
import { redirectMovedPages } from "./middlewares/redirect-moved-pages.js";
import { redirectEnforceTrailingSlash } from "./middlewares/redirect-enforce-trailing-slash.js";
import { redirectFundamental } from "./middlewares/redirect-fundamental.js";
import { redirectLocale } from "./middlewares/redirect-locale.js";
import { redirectPreferredLocale } from "./middlewares/redirect-preferred-locale.js";
import { redirectTrailingSlash } from "./middlewares/redirect-trailing-slash.js";
import { requireOrigin } from "./middlewares/require-origin.js";
import { notFound } from "./middlewares/not-found.js";
import { stripForwardedHostHeaders } from "./middlewares/stripForwardedHostHeaders.js";
import { proxyPong } from "./handlers/proxy-pong.js";
import { handleRunner } from "./internal/play/index.js";
import { proxySharedAssets } from "./handlers/proxy-shared-assets.js";

const router = Router();

/**
 * Register a GET/OPTIONS-only route. Other methods receive 405.
 * @param {string | string[]} path
 * @param  {...import("express").RequestHandler} handlers
 */
function getOnly(path, ...handlers) {
  router
    .route(path)
    .get(...handlers)
    .options(...handlers)
    .all((_req, res) => res.set("Allow", "GET, OPTIONS").sendStatus(405));
}

router.use(cookieParser());
router.use(stripForwardedHostHeaders);
router.use(redirectLeadingSlash);
// MDN Plus plans.
router.all(
  "/api/v1/stripe/plans",
  requireOrigin(Origin.main),
  handleStripePlans
);
// Backend.
router.all(
  ["/api/*", "/admin-api/*", "/events/fxa", "/users/fxa/*"],
  requireOrigin(Origin.main),
  proxyApi
);
// Telemetry.
router.all("/submit/mdn-dex/*", requireOrigin(Origin.main), proxyTelemetry);
router.all("/pong/*", requireOrigin(Origin.main), express.json(), proxyPong);
router.all("/pimg/*", requireOrigin(Origin.main), proxyPong);
// Playground.
getOnly(
  ["/[^/]+/docs/*/runner.html", "/[^/]+/blog/*/runner.html", "/runner.html"],
  requireOrigin(Origin.play),
  handleRunner
);
// Interactive example assets.
getOnly(
  "/shared-assets/*",
  requireOrigin(Origin.play, Origin.main, Origin.liveSamples),
  proxySharedAssets
);
// Assets.
getOnly(
  ["/assets/*", "/sitemaps/*", "/static/*", "/[^/]+.[^/]+"],
  requireOrigin(Origin.main),
  proxyContent
);
getOnly(
  "/[^/]+/search-index.json",
  requireOrigin(Origin.main),
  lowercasePathname,
  proxyContent
);
// Root.
getOnly("/", requireOrigin(Origin.main), redirectLocale);
// Live samples.
getOnly(
  ["/[^/]+/docs/*/_sample_.*.html", "/[^/]+/blog/*/_sample_.*.html"],
  requireOrigin(Origin.liveSamples),
  resolveIndexHTML,
  proxyContent
);
// Attachments.
getOnly(
  [
    `/[^/]+/docs/*/*.(${ANY_ATTACHMENT_EXT.join("|")})`,
    `/[^/]+/blog/*/*.(${ANY_ATTACHMENT_EXT.join("|")})`,
  ],
  requireOrigin(Origin.main, Origin.liveSamples, Origin.play),
  resolveIndexHTML,
  proxyContentAssets
);
// Pages.
router.use(redirectNonCanonicals);
getOnly(
  "/[^/]+/docs/*",
  requireOrigin(Origin.main),
  redirectFundamental,
  redirectLocale,
  redirectPreferredLocale,
  redirectTrailingSlash,
  redirectMovedPages,
  resolveIndexHTML,
  proxyContent
);
getOnly(
  ["/[^/]+/blog($|/*)", "/[^/]+/curriculum($|/*)"],
  requireOrigin(Origin.main),
  redirectLocale,
  redirectEnforceTrailingSlash,
  resolveIndexHTML,
  proxyContent
);
// MDN Plus, static pages, etc.
getOnly(
  "*",
  requireOrigin(Origin.main),
  redirectFundamental,
  redirectLocale,
  redirectTrailingSlash,
  resolveIndexHTML,
  proxyContent
);
router.all("*", notFound);

/**
 * Create the main MDN handler function for Google Cloud Functions
 * @returns {(req: Request, res: Response) => Promise<void>} Express-compatible handler
 */
export function createHandler() {
  return async (req, res) =>
    router(req, res, () => {
      /* noop */
    });
}
