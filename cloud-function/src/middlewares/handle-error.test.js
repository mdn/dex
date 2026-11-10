import { describe, it } from "node:test";
import { createServer, get } from "node:http";
import { once } from "node:events";
import express from "express";
import { strictEqual } from "node:assert/strict";
import { createRequest, createResponse } from "node-mocks-http";

import { handleError } from "./handle-error.js";

describe("handleError", () => {
  const cases = [
    { label: "no error", err: undefined, expected: 404 },
    { label: "URIError", err: new URIError("URI malformed"), expected: 400 },
    {
      label: "error with status",
      err: Object.assign(new Error("bad json"), { status: 400 }),
      expected: 400,
    },
    {
      label: "error with statusCode",
      err: Object.assign(new Error("too large"), { statusCode: 413 }),
      expected: 413,
    },
    {
      label: "error with non-error status",
      err: Object.assign(new Error("odd"), { status: 200 }),
      expected: 500,
    },
    { label: "plain error", err: new Error("boom"), expected: 500 },
    { label: "non-error value", err: "boom", expected: 500 },
  ];

  for (const { label, err, expected } of cases) {
    it(`responds ${expected} to ${label}`, (t) => {
      t.mock.method(console, "error", () => {});
      const res = createResponse();

      handleError(err, createRequest(), res);

      strictEqual(res.statusCode, expected);
      strictEqual(res.getHeader("cache-control"), "no-store");
      strictEqual(res._isEndCalled(), true);
    });
  }

  const sentCases = [
    { label: "a partial response", end: false, destroyed: 1 },
    { label: "an ended response", end: true, destroyed: 0 },
  ];

  for (const { label, end, destroyed } of sentCases) {
    it(`logs the error and destroys ${destroyed} times for ${label}`, (t) => {
      const error = t.mock.method(console, "error", () => {});
      const res = createResponse();
      const destroy = t.mock.method(res, "destroy", () => res);
      res.write("partial");
      if (end) {
        res.end();
      }
      const err = new Error("boom");

      handleError(err, createRequest(), res);

      strictEqual(error.mock.calls[0]?.arguments[0], err);
      strictEqual(destroy.mock.callCount(), destroyed);
    });
  }

  it("aborts a failed response after headers are sent", async (t) => {
    t.mock.method(console, "error", () => {});
    const app = express();
    let failResponse = () => {};
    app.get("/", (req, res) => {
      res.set("Cache-Control", "public, max-age=3600").write("partial");
      failResponse = () => handleError(new Error("boom"), req, res);
    });
    const server = createServer(app);
    t.after(() => {
      server.closeAllConnections();
      /** @type {Promise<void>} */
      const closed = new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      return closed;
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = /** @type {import("node:net").AddressInfo} */ (
      server.address()
    );

    /** @type {Promise<void>} */
    const completed = new Promise((resolve, reject) => {
      const req = get(`http://127.0.0.1:${port}/`, (res) => {
        res.on("end", () =>
          reject(new Error("Response completed successfully"))
        );
        res.on("error", () => {
          try {
            strictEqual(res.complete, false);
            strictEqual(res.aborted, true);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        res.resume();
        failResponse();
      });
      req.setTimeout(2000, () => req.destroy(new Error("No response")));
      req.on("error", reject);
    });
    await completed;
  });
});
