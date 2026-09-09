import { after, before, beforeEach, describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

import { Coder } from "../internal/pong/index.js";
import { startDummyBucket, startHandler } from "../proxy-helpers.js";

const SIGN_SECRET = "test-sign-secret";
const coder = new Coder(SIGN_SECRET);

/**
 * The dummy upstream doubles as the image host `/pimg/` fetches from.
 * @type {Record<string, import("../proxy-helpers.js").BucketFile>}
 */
const UPSTREAM_FILES = {
  "ad.png": { body: "png-bytes", contentType: "image/png" },
  // SVG can carry scripts and must be refused.
  "ad.svg": { body: "<svg></svg>", contentType: "image/svg+xml" },
};

describe("proxyBSA", () => {
  /** @type {Awaited<ReturnType<typeof startDummyBucket>>} */
  let upstream;
  /** @type {Awaited<ReturnType<typeof startHandler>>} */
  let handler;

  before(async () => {
    upstream = await startDummyBucket(UPSTREAM_FILES);
    // Read by env.js at import time, so set before startHandler loads the app.
    process.env["SIGN_SECRET"] = SIGN_SECRET;
    process.env["BSA_ZONE_KEYS"] = "top:ZONE_TOP;side:ZONE_SIDE";
    handler = await startHandler(upstream.url);
  });

  after(async () => {
    await handler?.close();
    await upstream?.close();
  });

  beforeEach(() => {
    upstream.requests.length = 0;
  });

  /** @param {string} src */
  const pimg = (src) => `/pimg/${encodeURIComponent(coder.encodeAndSign(src))}`;

  describe("method checks", () => {
    /** @type {Array<[path: string, method: string]>} */
    const cases = [
      ["/pong/get", "GET"],
      ["/pong/click", "POST"],
      ["/pong/viewed", "GET"],
      ["/pimg/anything", "POST"],
    ];

    for (const [path, method] of cases) {
      it(`rejects ${method} ${path} with 405`, async () => {
        const res = await handler.request(path, { method });
        strictEqual(res.status, 405);
      });
    }
  });

  it("responds 204 to unknown pong paths", async () => {
    const res = await handler.request("/pong/unknown");
    strictEqual(res.status, 204);
  });

  describe("POST /pong/get", () => {
    /** @param {unknown} body @param {Record<string, string>} [headers] */
    const get = (body, headers = {}) =>
      handler.request("/pong/get", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });

    it("rejects a body without a pongs array", async () => {
      const res = await get({});
      strictEqual(res.status, 400);
      strictEqual(res.headers.get("cache-control"), "no-store");
      strictEqual(res.headers.get("content-type"), "application/json");
      deepStrictEqual(JSON.parse(res.text), {
        status: "invalid",
        plusAvailable: true,
      });
    });

    it("rejects pongs that match no configured zone", async () => {
      const res = await get({ pongs: ["unknown"] });
      strictEqual(res.status, 400);
      deepStrictEqual(JSON.parse(res.text), {
        status: "empty",
        plusAvailable: true,
      });
    });

    it("reports plusAvailable based on the viewer country", async () => {
      const res = await get({}, { "cloudfront-viewer-country": "XX" });
      deepStrictEqual(JSON.parse(res.text), {
        status: "invalid",
        plusAvailable: false,
      });
    });
  });

  describe("GET /pong/click", () => {
    it("requires a referer", async () => {
      const res = await handler.request("/pong/click?code=x");
      strictEqual(res.status, 400);
    });

    it("rejects a referer from another host", async () => {
      const res = await handler.request("/pong/click?code=x", {
        headers: { referer: "https://example.com/" },
      });
      strictEqual(res.status, 400);
    });

    it("rejects a missing code", async () => {
      const res = await handler.request("/pong/click", {
        headers: { referer: `http://127.0.0.1:${handler.port}/` },
      });
      strictEqual(res.status, 400);
    });

    it("rejects an unsigned code", async () => {
      const res = await handler.request("/pong/click?code=dW5zaWduZWQ.bad", {
        headers: { referer: `http://127.0.0.1:${handler.port}/` },
      });
      strictEqual(res.status, 404);
    });
  });

  describe("POST /pong/viewed", () => {
    it("rejects a missing code", async () => {
      const res = await handler.request("/pong/viewed", { method: "POST" });
      strictEqual(res.status, 400);
    });

    it("acknowledges an unsigned code without contacting upstream", async () => {
      const res = await handler.request("/pong/viewed?code=dW5zaWduZWQ.bad", {
        method: "POST",
      });
      strictEqual(res.status, 201);
      deepStrictEqual(upstream.requests, []);
    });
  });

  describe("GET /pimg/", () => {
    it("rejects an unsigned src", async () => {
      const res = await handler.request("/pimg/dW5zaWduZWQ.bad");
      strictEqual(res.status, 400);
      deepStrictEqual(upstream.requests, []);
    });

    it("proxies a signed image with hardened headers", async () => {
      const res = await handler.request(pimg(`${upstream.url}ad.png`));
      strictEqual(res.status, 200);
      strictEqual(res.text, "png-bytes");
      strictEqual(res.headers.get("content-type"), "image/png");
      strictEqual(res.headers.get("cache-control"), "max-age=86400");
      strictEqual(res.headers.get("x-content-type-options"), "nosniff");
      strictEqual(res.headers.get("x-robots-tag"), "noindex, nofollow");
      deepStrictEqual(upstream.requests, ["ad.png"]);
    });

    it("refuses non-raster content types", async () => {
      const res = await handler.request(pimg(`${upstream.url}ad.svg`));
      strictEqual(res.status, 502);
      strictEqual(res.headers.get("cache-control"), "no-store");
    });

    it("passes through upstream errors uncached", async () => {
      const res = await handler.request(pimg(`${upstream.url}missing.png`));
      strictEqual(res.status, 404);
      strictEqual(res.headers.get("cache-control"), "no-store");
    });
  });
});
