/** @import { AddressInfo } from "node:net" */

import { after, before, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import { getFunction } from "@google-cloud/functions-framework/testing";
import * as Sentry from "@sentry/google-cloud-serverless";

/** @param {string} name */
const fixture = (name) => new URL(`fixtures/${name}`, import.meta.url).pathname;

// A well-formed DSN pointing at a closed local port, so `Sentry.init()` runs
// for real while nothing can leave the machine.
const SENTRY_DSN = "http://public@127.0.0.1:9/1";

// `app.test.js` covers the plain handler; this file covers the `SENTRY_DSN`
// branch of `index.js`, which wraps the handler in the Sentry SDK. It must be a
// separate file because `index.js` reads the env once at import time and
// `node --test` isolates each file in its own process.
describe("mdnHandler with SENTRY_DSN", () => {
  /** @type {import("node:http").Server} */
  let server;
  /** @type {number} */
  let port;

  before(async () => {
    process.env["ENV_FILE"] = "/dev/null";
    process.env["ORIGIN_MAIN"] = "127.0.0.1";
    process.env["CANONICALS_FILE"] = fixture("canonicals.json");
    process.env["REDIRECTS_FILE"] = fixture("redirects.json");
    process.env["SENTRY_DSN"] = SENTRY_DSN;
    await import("./index.js");

    // The wrapped handler is async, so drive it through a real server instead
    // of synchronous mocks.
    const app = express();
    app.use(/** @type {express.RequestHandler} */ (getFunction("mdnHandler")));
    server = createServer(app).listen(0, "127.0.0.1");
    await once(server, "listening");
    ({ port } = /** @type {AddressInfo} */ (server.address()));
  });

  after(async () => {
    server?.close();
    await once(server, "close");
    await Sentry.close(0);
  });

  it("initializes the Sentry client from SENTRY_DSN", () => {
    const client = Sentry.getClient();
    ok(client, "expected Sentry.init() to register a client");
    strictEqual(client.getDsn()?.host, "127.0.0.1");
  });

  it("serves requests through the Sentry-wrapped handler", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      redirect: "manual",
    });

    strictEqual(res.status, 302);
    strictEqual(res.headers.get("location"), "/en-US/");
  });
});
