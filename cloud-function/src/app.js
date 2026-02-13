/** @import { Request, Response } from "express" */

import cookieParser from "cookie-parser";
import express, { Router } from "express";

import { ANY_ATTACHMENT_REGEXP } from "./internal/constants/index.js";

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
  ["/api/*splat", "/admin-api/*splat", "/events/fxa", "/users/fxa/*splat"],
  requireOrigin(Origin.main),
  proxyApi
);
// Telemetry.
router.all(
  "/submit/mdn-dex/*splat",
  requireOrigin(Origin.main),
  proxyTelemetry
);
router.all(
  "/pong/*splat",
  requireOrigin(Origin.main),
  express.json(),
  proxyPong
);
router.all("/pimg/*splat", requireOrigin(Origin.main), proxyPong);
// Playground.
router.get(
  [
    "/:locale/docs/*path/runner.html",
    "/:locale/blog/*path/runner.html",
    "/runner.html",
  ],
  requireOrigin(Origin.play),
  handleRunner
);
// Interactive example assets.
router.get(
  "/shared-assets/*splat",
  requireOrigin(Origin.play, Origin.main, Origin.liveSamples),
  proxySharedAssets
);
// Assets.
router.get(
  ["/assets/*splat", "/sitemaps/*splat", "/static/*splat", "/:file.:ext"],
  requireOrigin(Origin.main),
  proxyContent
);
router.get(
  "/:locale/search-index.json",
  requireOrigin(Origin.main),
  lowercasePathname,
  proxyContent
);
// Root.
router.get("/", requireOrigin(Origin.main), redirectLocale);
// Live samples.
router.get(
  [
    "/:locale/docs/*path/_sample_.:sampleId.html",
    "/:locale/blog/*path/_sample_.:sampleId.html",
  ],
  requireOrigin(Origin.liveSamples),
  resolveIndexHTML,
  proxyContent
);
// Attachments.
router.get(
  ["/:locale/docs/*path/:filename.:ext", "/:locale/blog/*path/:filename.:ext"],
  (req, _res, next) => {
    if (ANY_ATTACHMENT_REGEXP.test(req.path)) {
      return next();
    }
    next("route");
  },
  requireOrigin(Origin.main, Origin.liveSamples, Origin.play),
  resolveIndexHTML,
  proxyContentAssets
);
// Pages.
router.use(redirectNonCanonicals);
router.get(
  "/:locale/docs/*splat",
  requireOrigin(Origin.main),
  redirectFundamental,
  redirectLocale,
  redirectPreferredLocale,
  redirectTrailingSlash,
  redirectMovedPages,
  resolveIndexHTML,
  proxyContent
);
router.get(
  ["/:locale/blog{/*splat}", "/:locale/curriculum{/*splat}"],
  requireOrigin(Origin.main),
  redirectLocale,
  redirectEnforceTrailingSlash,
  resolveIndexHTML,
  proxyContent
);
// MDN Plus, static pages, etc.
router.get(
  "{/*splat}",
  requireOrigin(Origin.main),
  redirectFundamental,
  redirectLocale,
  redirectTrailingSlash,
  resolveIndexHTML,
  proxyContent
);
router.get("{/*splat}", notFound);
router.all("{/*splat}", (_req, res) => res.set("Allow", "GET").sendStatus(405));

/**
 * Create the main MDN handler function for Google Cloud Functions
 * @returns {(req: Request, res: Response) => Promise<void>} Express-compatible handler
 */
export function createHandler() {
  return async (req, res) => {
    await router(req, res, () => {
      /* noop */
    });
  };
}
