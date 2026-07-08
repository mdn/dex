import { after, before, beforeEach, describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { gzipSync } from "node:zlib";

import { startDummyBucket, startHandler } from "./proxy-helpers.js";

/**
 * Minimal bucket contents covering one file per proxied route category. Keys are
 * bucket paths without a leading slash, mirroring the layout in
 * `content-prod-mdn/` (locale folders are lowercase).
 * @type {Record<string, import("./proxy-helpers.js").BucketFile>}
 */
const BUCKET_FILES = {
  "en-us/search-index.json": {
    body: '{"search":"index"}',
    contentType: "application/json",
  },
  "en-us/metadata.json": {
    body: '{"locale":"en-US"}',
    contentType: "application/json",
  },
  "en-us/docs/web/api/index.html": {
    body: "<h1>Web API</h1>",
    contentType: "text/html",
  },
  "en-us/docs/web/api/index.json": {
    body: '{"doc":"data"}',
    contentType: "application/json",
  },
  "en-us/docs/web/api/metadata.json": {
    body: '{"meta":"data"}',
    contentType: "application/json",
  },
  "en-us/docs/web/api/contributors.txt": {
    body: "contributors",
    contentType: "text/plain",
  },
  // A doc page whose slug ends in ".json" (e.g. the WebExtensions manifest.json
  // page). The page itself lives in a folder; only the sidecar files are objects.
  "en-us/docs/mozilla/add-ons/webextensions/manifest.json/index.html": {
    body: "<h1>manifest.json</h1>",
    contentType: "text/html",
  },
  "en-us/docs/mozilla/add-ons/webextensions/manifest.json/index.json": {
    body: '{"slug":"manifest.json"}',
    contentType: "application/json",
  },
  // A doc slug containing ":" which slugToFolder rewrites to "_colon_".
  "en-us/docs/web/css/reference/selectors/_colon_has/index.html": {
    body: "<h1>:has</h1>",
    contentType: "text/html",
  },
  "en-us/docs/web/css/reference/selectors/_colon_has/index.json": {
    body: '{"slug":":has"}',
    contentType: "application/json",
  },
  "en-us/blog/some-post/index.html": {
    body: "<h1>Some post</h1>",
    contentType: "text/html",
  },
  "en-us/curriculum/index.html": {
    body: "<h1>Curriculum</h1>",
    contentType: "text/html",
  },
  "static/client/1002.41b70a0dadf2f657.js": {
    body: "console.log('bundle');",
    contentType: "application/javascript",
  },
  "static/client/1002.41b70a0dadf2f657.js.map": {
    body: '{"version":3,"file":"bundle.js"}',
    contentType: "application/json",
  },
  "static/css/main.fe619051.css": {
    body: ".main{}",
    contentType: "text/css",
  },
  "static/css/main.fe619051.css.map": {
    body: '{"version":3,"file":"main.css"}',
    contentType: "application/json",
  },
  "static/service-worker/service-worker.js": {
    body: "self.addEventListener('install', () => {});",
    contentType: "application/javascript",
  },
  "static/service-worker/service-worker.js.map": {
    body: '{"version":3,"file":"service-worker.js"}',
    contentType: "application/json",
  },
  "assets/playground.png": { body: "playground-png", contentType: "image/png" },
  "sitemaps/en-us/sitemap.xml.gz": {
    // Served with `Content-Encoding: gzip` (see headers.js), so use a real
    // gzip payload the client can transparently decompress.
    body: gzipSync("<urlset></urlset>"),
    contentType: "application/xml",
  },
  "favicon.ico": { body: "favicon", contentType: "image/x-icon" },
  "en-us/docs/web/api/foo.png": {
    body: "foo-png-en-us",
    contentType: "image/png",
  },
  "en-us/404/index.html": {
    body: "<h1>Not found</h1>",
    contentType: "text/html",
  },
  "fr/404/index.html": {
    body: "<h1>Introuvable</h1>",
    contentType: "text/html",
  },
};

describe("proxied content routes", () => {
  /** @type {Awaited<ReturnType<typeof startDummyBucket>>} */
  let bucket;
  /** @type {Awaited<ReturnType<typeof startHandler>>} */
  let handler;

  before(async () => {
    bucket = await startDummyBucket(BUCKET_FILES);
    handler = await startHandler(bucket.url);
  });

  after(async () => {
    await handler?.close();
    await bucket?.close();
  });

  beforeEach(() => {
    bucket.requests.length = 0;
  });

  describe("URL → bucket path mapping", () => {
    /** @type {Array<[label: string, requestPath: string, bucketPath: string]>} */
    const cases = [
      [
        "search index (lowercases locale)",
        "/en-US/search-index.json",
        "en-us/search-index.json",
      ],
      [
        "locale metadata (.json slug, verbatim)",
        "/en-US/metadata.json",
        "en-us/metadata.json",
      ],
      [
        "docs page (slug→folder + index.html)",
        "/en-US/docs/Web/API",
        "en-us/docs/web/api/index.html",
      ],
      [
        "docs data (index.json, no index.html appended)",
        "/en-US/docs/Web/API/index.json",
        "en-us/docs/web/api/index.json",
      ],
      [
        "docs metadata (metadata.json)",
        "/en-US/docs/Web/API/metadata.json",
        "en-us/docs/web/api/metadata.json",
      ],
      [
        "docs contributors (contributors.txt)",
        "/en-US/docs/Web/API/contributors.txt",
        "en-us/docs/web/api/contributors.txt",
      ],
      [
        "data file under a .json-suffixed slug",
        "/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/index.json",
        "en-us/docs/mozilla/add-ons/webextensions/manifest.json/index.json",
      ],
      [
        "slug with colon (:has → _colon_has)",
        "/en-US/docs/Web/CSS/Reference/Selectors/:has",
        "en-us/docs/web/css/reference/selectors/_colon_has/index.html",
      ],
      [
        "data file under a colon slug",
        "/en-US/docs/Web/CSS/Reference/Selectors/:has/index.json",
        "en-us/docs/web/css/reference/selectors/_colon_has/index.json",
      ],
      [
        "blog page",
        "/en-US/blog/some-post/",
        "en-us/blog/some-post/index.html",
      ],
      [
        "curriculum landing",
        "/en-US/curriculum/",
        "en-us/curriculum/index.html",
      ],
      [
        "static hashed JS bundle (verbatim)",
        "/static/client/1002.41b70a0dadf2f657.js",
        "static/client/1002.41b70a0dadf2f657.js",
      ],
      [
        "static JS source map (verbatim)",
        "/static/client/1002.41b70a0dadf2f657.js.map",
        "static/client/1002.41b70a0dadf2f657.js.map",
      ],
      [
        "static hashed CSS (verbatim)",
        "/static/css/main.fe619051.css",
        "static/css/main.fe619051.css",
      ],
      [
        "static CSS source map (verbatim)",
        "/static/css/main.fe619051.css.map",
        "static/css/main.fe619051.css.map",
      ],
      [
        "service worker (verbatim)",
        "/static/service-worker/service-worker.js",
        "static/service-worker/service-worker.js",
      ],
      [
        "service worker source map (verbatim)",
        "/static/service-worker/service-worker.js.map",
        "static/service-worker/service-worker.js.map",
      ],
      [
        "app asset (verbatim)",
        "/assets/playground.png",
        "assets/playground.png",
      ],
      [
        "sitemap (verbatim)",
        "/sitemaps/en-us/sitemap.xml.gz",
        "sitemaps/en-us/sitemap.xml.gz",
      ],
      ["root file", "/favicon.ico", "favicon.ico"],
      [
        "doc attachment (slug→folder)",
        "/en-US/docs/Web/API/foo.png",
        "en-us/docs/web/api/foo.png",
      ],
    ];

    for (const [label, requestPath, bucketPath] of cases) {
      it(`maps ${label}: ${requestPath} → ${bucketPath}`, async () => {
        const response = await handler.request(requestPath);

        strictEqual(response.status, 200, `expected 200 for ${requestPath}`);
        ok(
          bucket.requests.includes(bucketPath),
          `expected bucket to receive "${bucketPath}", got ${JSON.stringify(bucket.requests)}`
        );
      });
    }
  });

  describe("response body passthrough", () => {
    it("serves the search index body", async () => {
      const response = await handler.request("/en-US/search-index.json");
      strictEqual(response.text, BUCKET_FILES["en-us/search-index.json"]?.body);
    });

    it("serves the docs page body", async () => {
      const response = await handler.request("/en-US/docs/Web/API");
      strictEqual(
        response.text,
        BUCKET_FILES["en-us/docs/web/api/index.html"]?.body
      );
    });
  });

  describe("fallbacks", () => {
    // `get404ForLocale` populates a module-level `notFoundBufferCache` on the
    // first successful 404-page fetch (REVIEW_ROUTING is off here), so a
    // locale's `404/index.html` is fetched from the bucket only once per
    // process. The `bucket.requests` assertions below therefore rely on no
    // earlier test having fetched that same 404 page first; keep 404-page
    // cases here and mind the ordering if adding more.
    //
    // Both locales are checked so an implementation that always returns the
    // en-US 404 page would fail the fr case.
    for (const [locale, folder] of [
      ["en-US", "en-us"],
      ["fr", "fr"],
    ]) {
      it(`serves the ${locale} 404 page for a missing ${locale} doc`, async () => {
        const response = await handler.request(`/${locale}/docs/Web/Missing`);

        strictEqual(response.status, 404);
        strictEqual(
          response.text,
          BUCKET_FILES[`${folder}/404/index.html`]?.body
        );
        ok(
          bucket.requests.includes(`${folder}/404/index.html`),
          `expected ${folder} 404 fallback fetch, got ${JSON.stringify(bucket.requests)}`
        );
      });
    }

    it("falls back to the en-US asset for a missing non-English attachment", async () => {
      const response = await handler.request("/fr/docs/Web/API/foo.png");

      strictEqual(response.status, 200);
      strictEqual(
        response.text,
        BUCKET_FILES["en-us/docs/web/api/foo.png"]?.body
      );
      deepStrictEqual(
        [
          bucket.requests.includes("fr/docs/web/api/foo.png"),
          bucket.requests.includes("en-us/docs/web/api/foo.png"),
        ],
        [true, true],
        `expected fr miss then en-us fallback, got ${JSON.stringify(bucket.requests)}`
      );
    });

    it("resolves a .json-suffixed page slug via the index.html fallback", async () => {
      // The slug ends in ".json", so `isAsset` is true and no `index.html` is
      // appended; the verbatim object 404s, and the 404 handler then retries
      // with `/index.html` appended, which succeeds.
      const response = await handler.request(
        "/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json"
      );

      strictEqual(response.status, 200);
      strictEqual(
        response.text,
        BUCKET_FILES[
          "en-us/docs/mozilla/add-ons/webextensions/manifest.json/index.html"
        ]?.body
      );
      deepStrictEqual(
        bucket.requests,
        [
          "en-us/docs/mozilla/add-ons/webextensions/manifest.json",
          "en-us/docs/mozilla/add-ons/webextensions/manifest.json/index.html",
        ],
        `expected verbatim miss then index.html retry, got ${JSON.stringify(bucket.requests)}`
      );
    });

    it("passes the upstream 404 through for a missing live sample", async () => {
      // Live-sample URLs skip the index.html/404-page fallback (isLiveSampleURL
      // → return null), so the upstream 404 is served as-is.
      const response = await handler.request(
        "/en-US/docs/Web/foo/_sample_.zzz.html"
      );

      strictEqual(response.status, 404);
      deepStrictEqual(bucket.requests, [
        "en-us/docs/web/foo/_sample_.zzz.html",
      ]);
      ok(
        !bucket.requests.includes("en-us/404/index.html"),
        "live-sample 404 should not trigger the 404-page fallback"
      );
    });

    it("returns the upstream 404 for an inactive-locale attachment", async () => {
      // proxyContentAssets only attempts an en-US fallback for active locales;
      // an unknown locale returns null, passing the upstream 404 through.
      const response = await handler.request("/zz/docs/Web/API/foo.png");

      strictEqual(response.status, 404);
      deepStrictEqual(bucket.requests, ["zz/docs/web/api/foo.png"]);
    });

    it("returns 404 when neither the localized nor the en-US attachment exists", async () => {
      const response = await handler.request("/fr/docs/Web/API/missing.png");

      strictEqual(response.status, 404);
      deepStrictEqual(
        [
          bucket.requests.includes("fr/docs/web/api/missing.png"),
          bucket.requests.includes("en-us/docs/web/api/missing.png"),
        ],
        [true, true],
        `expected fr miss then en-us miss, got ${JSON.stringify(bucket.requests)}`
      );
    });

    it("does not fall back to en-US for a missing non-English data file", async () => {
      // Data files (index.json/metadata.json/…) route through `proxyContent`,
      // not `proxyContentAssets`, so — unlike media attachments — a missing
      // localized file serves the localized 404 rather than the en-US file.
      const response = await handler.request("/fr/docs/Web/API/index.json");

      strictEqual(response.status, 404);
      ok(
        !bucket.requests.includes("en-us/docs/web/api/index.json"),
        `expected no en-US data fallback, got ${JSON.stringify(bucket.requests)}`
      );
    });
  });
});
