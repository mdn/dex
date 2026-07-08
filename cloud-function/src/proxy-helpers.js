/** @import { AddressInfo } from "node:net" */
/** @import { Server } from "node:http" */

import { createServer } from "node:http";

import express from "express";

/** @param {string} name */
const fixture = (name) => new URL(`fixtures/${name}`, import.meta.url).pathname;

/**
 * A single file served by the dummy bucket.
 * @typedef {object} BucketFile
 * @property {string | Buffer} body
 * @property {string} [contentType]
 */

/**
 * An in-memory stand-in for the content bucket.
 * @typedef {object} DummyBucket
 * @property {number} port
 * @property {string} url - trailing-slashed base URL, e.g. "http://127.0.0.1:1234/"
 * @property {string[]} requests - normalized paths (no leading slash) received, in order
 * @property {() => Promise<void>} close
 */

/**
 * Start an in-memory upstream that mimics the content bucket. It records every
 * requested path (so tests can assert URL→file mapping) and serves the provided
 * files, returning 404 for anything else.
 * @param {Record<string, BucketFile>} files - keyed by bucket path without a
 *   leading slash, e.g. "en-us/search-index.json"
 * @returns {Promise<DummyBucket>}
 */
export async function startDummyBucket(files) {
  /** @type {string[]} */
  const requests = [];

  const server = createServer((req, res) => {
    const rawPath = (req.url ?? "/").split("?")[0] ?? "/";
    const path = decodeURIComponent(rawPath).replace(/^\/+/, "");
    requests.push(path);

    const file = files[path];
    if (!file) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("not found");
      return;
    }

    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      file.contentType ?? "application/octet-stream"
    );
    res.end(file.body);
  });

  await listen(server);
  const { port } = /** @type {AddressInfo} */ (server.address());

  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    requests,
    close: () => close(server),
  };
}

/**
 * A running instance of the MDN handler.
 * @typedef {object} Handler
 * @property {number} port
 * @property {(path: string, init?: RequestInit) => Promise<{status: number, headers: Headers, text: string}>} request
 * @property {() => Promise<void>} close
 */

/**
 * Start the real MDN handler wired to the given upstream. `SOURCE_CONTENT`, the
 * shared-assets source, and the origins are captured at import time, so this
 * must be called after the dummy bucket is listening and only once per test
 * process.
 * @param {string} sourceContent - trailing-slashed upstream URL (the dummy bucket)
 * @param {{ sourceSharedAssets?: string }} [options] - optional overrides;
 *   `sourceSharedAssets` is the trailing-slashed shared-assets upstream URL
 * @returns {Promise<Handler>}
 */
export async function startHandler(sourceContent, options = {}) {
  // These assignments mutate the process-wide `process.env` and are never
  // restored, which is safe because `node --test` runs each test *file* in its
  // own child process — so suites in separate files don't share this state. A
  // second `startHandler` call in the same file would reuse the already-loaded
  // (and env-captured) modules; call it once per process.
  //
  // Prevent .env from overriding our test configuration.
  process.env["ENV_FILE"] = "/dev/null";
  process.env["SOURCE_CONTENT"] = sourceContent;
  if (options.sourceSharedAssets) {
    process.env["SOURCE_SHARED_ASSETS"] = options.sourceSharedAssets;
  }
  // Make the origin guards accept requests we send to 127.0.0.1.
  process.env["ORIGIN_MAIN"] = "127.0.0.1";
  process.env["ORIGIN_LIVE_SAMPLES"] = "127.0.0.1";
  process.env["ORIGIN_PLAY"] = "127.0.0.1";
  process.env["CANONICALS_FILE"] = fixture("canonicals.json");
  process.env["REDIRECTS_FILE"] = fixture("redirects.json");

  // Import after the env is set, since env.js and the proxy handlers capture
  // SOURCE_CONTENT / the origins at module-load time.
  const { createHandler } = await import("./app.js");
  // Wrap in an Express app so req/res get the Express augmentation the handler
  // relies on (req.hostname, res.sendStatus, …), just like the Functions
  // Framework does in production.
  const app = express();
  app.use(createHandler());
  const server = createServer(app);
  await listen(server);
  const { port } = /** @type {AddressInfo} */ (server.address());

  return {
    port,
    request: async (path, init) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        redirect: "manual",
        ...init,
      });
      return {
        status: response.status,
        headers: response.headers,
        text: await response.text(),
      };
    },
    close: () => close(server),
  };
}

/**
 * @param {Server} server
 * @returns {Promise<void>}
 */
function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
}

/**
 * @param {Server} server
 * @returns {Promise<void>}
 */
function close(server) {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}
