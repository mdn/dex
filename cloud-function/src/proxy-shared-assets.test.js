import { after, before, beforeEach, describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

import { startDummyBucket, startHandler } from "./proxy-helpers.js";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Files served by the dummy shared-assets upstream. Keys are upstream paths
 * without a leading slash, i.e. after `/shared-assets/` has been stripped.
 * @type {Record<string, import("./proxy-helpers.js").BucketFile>}
 */
const UPSTREAM_FILES = {
  "audio/t-rex-roar.mp3": { body: "roar", contentType: "audio/mpeg" },
  "fonts/Inter.var.woff2": { body: "font", contentType: "font/woff2" },
  "images/examples/balloon.jpg": {
    body: "balloon",
    contentType: "image/jpeg",
  },
  "misc/friday.vtt": { body: "WEBVTT", contentType: "text/vtt" },
  "text/quotes.md": { body: "# Quotes", contentType: "text/markdown" },
  "videos/flower.webm": { body: "flower", contentType: "video/webm" },
};

describe("proxySharedAssets", () => {
  /** @type {Awaited<ReturnType<typeof startDummyBucket>>} */
  let upstream;
  /** @type {Awaited<ReturnType<typeof startHandler>>} */
  let handler;

  before(async () => {
    upstream = await startDummyBucket(UPSTREAM_FILES);
    // `SOURCE_CONTENT` is irrelevant here; reuse the same upstream for it.
    handler = await startHandler(upstream.url, {
      sourceSharedAssets: upstream.url,
    });
  });

  after(async () => {
    await handler?.close();
    await upstream?.close();
  });

  beforeEach(() => {
    upstream.requests.length = 0;
  });

  describe("path rewrite", () => {
    for (const upstreamPath of Object.keys(UPSTREAM_FILES)) {
      it(`strips /shared-assets/ and passes the body through: ${upstreamPath}`, async () => {
        const response = await handler.request(
          `/shared-assets/${upstreamPath}`
        );

        strictEqual(response.status, 200);
        deepStrictEqual(upstream.requests, [upstreamPath]);
        strictEqual(response.text, UPSTREAM_FILES[upstreamPath]?.body);
      });
    }
  });

  describe("cache-control", () => {
    it("sets a 30-day public cache on a 2xx response", async () => {
      const response = await handler.request(
        "/shared-assets/images/examples/balloon.jpg"
      );

      strictEqual(response.status, 200);
      strictEqual(
        response.headers.get("cache-control"),
        `public, max-age=${THIRTY_DAYS}`
      );
    });

    it("sets no-store on a non-2xx (missing) response", async () => {
      const response = await handler.request(
        "/shared-assets/images/examples/does-not-exist.jpg"
      );

      strictEqual(response.status, 404);
      strictEqual(
        response.headers.get("cache-control"),
        "no-store, must-revalidate"
      );
      deepStrictEqual(upstream.requests, [
        "images/examples/does-not-exist.jpg",
      ]);
    });
  });
});
