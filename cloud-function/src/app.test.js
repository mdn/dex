/** @import { Request, Response } from "express" */

import { before, describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { getFunction } from "@google-cloud/functions-framework/testing";

describe("mdnHandler", () => {
  /** @type {(req: Request, res: Response) => void} */
  let mdnHandler;

  before(async () => {
    process.env["ENV_FILE"] = "/dev/null";
    await import("./index.js");
    mdnHandler =
      /** @type {(req: Request, res: Response) => void} */
      (getFunction("mdnHandler"));
  });

  /**
   * @param {string} method
   * @param {string} url
   */
  function createMocks(method, url) {
    const req = /** @type {Request} */ (
      /** @type {any} */ ({
        method,
        url,
        path: url,
        protocol: "http",
        hostname: "localhost",
        headers: { host: "localhost" },
        cookies: {},
        get(/** @type {string} */ name) {
          return this.headers[name.toLowerCase()];
        },
      })
    );

    /** @type {Record<string, string>} */
    const resHeaders = {};

    const res = /** @type {Response} */ (
      /** @type {any} */ ({
        statusCode: 200,
        status(/** @type {number} */ code) {
          this.statusCode = code;
          return this;
        },
        sendStatus(/** @type {number} */ code) {
          this.statusCode = code;
          return this;
        },
        send() {
          return this;
        },
        end() {
          return this;
        },
        set(/** @type {string} */ name, /** @type {string} */ value) {
          if (name && value) resHeaders[name.toLowerCase()] = value;
          return this;
        },
        setHeader(/** @type {string} */ name, /** @type {string} */ value) {
          resHeaders[name.toLowerCase()] = value;
          return this;
        },
        getHeader(/** @type {string} */ name) {
          return resHeaders[name.toLowerCase()];
        },
        redirect(/** @type {number | string} */ statusOrUrl) {
          this.statusCode = typeof statusOrUrl === "number" ? statusOrUrl : 302;
          return this;
        },
      })
    );

    return { req, res, resHeaders };
  }

  it("returns 302 for GET /", async () => {
    const { req, res } = createMocks("GET", "/");
    mdnHandler(req, res);

    strictEqual(res.statusCode, 302);
  });
});
