import { after, afterEach, before, describe, it, mock } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";

import { startDummyBucket, startHandler } from "./proxy-helpers.js";
import { Coder } from "./internal/pong/coding.js";
import {
  createPong2ClickHandler,
  createPong2ViewedHandler,
} from "./internal/pong/pong2.js";

const coder = new Coder("test-secret");
const params = new URLSearchParams({
  code: coder.encodeAndSign("https://example.invalid/ad"),
});

function erroredBody() {
  return new ReadableStream({
    start(controller) {
      controller.error(new Error("upstream body failed"));
    },
  });
}

describe("fetch response body cleanup", () => {
  /** @type {Awaited<ReturnType<typeof startDummyBucket>>} */
  let bucket;
  /** @type {Awaited<ReturnType<typeof startHandler>>} */
  let handler;

  before(async () => {
    bucket = await startDummyBucket({});
    handler = await startHandler(bucket.url);
  });
  afterEach(() => mock.reset());
  after(async () => {
    await handler.close();
    await bucket.close();
  });

  const adCases = [
    {
      name: "click",
      run: createPong2ClickHandler(coder),
      expected: { status: 302, location: "https://example.invalid/landing" },
    },
    {
      name: "view",
      run: createPong2ViewedHandler(coder),
      expected: { status: 200 },
    },
  ];
  for (const { name, run, expected } of adCases) {
    it(`cancels an open ${name} response body while preserving the result`, async () => {
      let cancelled = false;
      mock.method(
        globalThis,
        "fetch",
        async () =>
          new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
            {
              status: 302,
              headers: { location: "https://example.invalid/landing" },
            }
          )
      );
      deepStrictEqual(await run(params, "US", "test-agent"), expected);
      strictEqual(cancelled, true);
    });
    it(`preserves the ${name} result when cancellation rejects`, async () => {
      mock.method(
        globalThis,
        "fetch",
        async () =>
          new Response(erroredBody(), {
            status: 302,
            headers: { location: "https://example.invalid/landing" },
          })
      );
      deepStrictEqual(await run(params, "US", "test-agent"), expected);
    });
    it(`accepts a bodyless ${name} response`, async () => {
      mock.method(
        globalThis,
        "fetch",
        async () => new Response(null, { status: 204 })
      );
      const result = await run(params, "US", "test-agent");
      strictEqual(result.status, name === "click" ? 204 : 200);
    });
  }

  const fallbackCases = [
    {
      name: "HTML fallback and localized 404 page",
      path: "/fr/docs/Web/Missing",
      status: 404,
      expected: "not found",
      cancellations: 3,
    },
    {
      name: "asset fallback",
      path: "/fr/docs/Web/API/missing.png",
      status: 404,
      expected: "not found",
      cancellations: 1,
    },
  ];
  for (const { name, path, status, expected, cancellations } of fallbackCases) {
    it(
      `cancels open failed bodies for ${name}`,
      { timeout: 5000 },
      async () => {
        let cancelled = 0;
        const originalFetch = globalThis.fetch;
        mock.method(
          globalThis,
          "fetch",
          async (
            /** @type {string | URL | Request} */ url,
            /** @type {RequestInit} */ options
          ) => {
            if (String(url).startsWith(bucket.url)) {
              return new Response(
                new ReadableStream({
                  cancel() {
                    cancelled++;
                  },
                }),
                { status: 404 }
              );
            }
            return originalFetch(url, options);
          }
        );
        const response = await handler.request(path);
        strictEqual(response.status, status);
        strictEqual(response.text, expected);
        strictEqual(cancelled, cancellations);
      }
    );
    it(
      `preserves ${name} when cancellation rejects`,
      { timeout: 5000 },
      async () => {
        const originalFetch = globalThis.fetch;
        mock.method(
          globalThis,
          "fetch",
          async (
            /** @type {string | URL | Request} */ url,
            /** @type {RequestInit} */ options
          ) => {
            if (String(url).startsWith(bucket.url)) {
              return new Response(erroredBody(), { status: 404 });
            }
            return originalFetch(url, options);
          }
        );
        const response = await handler.request(path);
        strictEqual(response.status, status);
        strictEqual(response.text, expected);
      }
    );
  }

  it("preserves the search-index status error and retry when cancellation rejects", async () => {
    // Import lazily: env.js captures process.env at load, after startHandler.
    const { getSearchIndex, clearSearchIndexCache } =
      await import("./internal/quicksearch/index.js");
    clearSearchIndexCache();
    mock.method(
      globalThis,
      "fetch",
      async () => new Response(erroredBody(), { status: 503 })
    );
    await rejects(getSearchIndex("en-us"), /Unexpected status 503/);
    mock.reset();
    mock.method(globalThis, "fetch", async () => Response.json([]));
    strictEqual((await getSearchIndex("en-us")).items.length, 0);
    clearSearchIndexCache();
  });

  it("cancels a failed search-index body and permits retry", async () => {
    // Import lazily: env.js captures process.env at load, after startHandler.
    const { getSearchIndex, clearSearchIndexCache } =
      await import("./internal/quicksearch/index.js");
    clearSearchIndexCache();
    let cancelled = false;
    mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { status: 503 }
        )
    );
    await rejects(getSearchIndex("en-us"), /Unexpected status 503/);
    strictEqual(cancelled, true);
    mock.reset();
    mock.method(globalThis, "fetch", async () => Response.json([]));
    strictEqual((await getSearchIndex("en-us")).items.length, 0);
    clearSearchIndexCache();
  });
});
