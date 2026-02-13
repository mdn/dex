/** @import { Request, Response } from "express" */

import { before, describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { getFunction } from "@google-cloud/functions-framework/testing";
import { createRequest, createResponse } from "node-mocks-http";

/** @param {string} name */
const fixture = (name) => new URL(`fixtures/${name}`, import.meta.url).pathname;

describe("mdnHandler", () => {
  /** @type {(req: Request, res: Response) => void} */
  let mdnHandler;

  before(async () => {
    process.env["ENV_FILE"] = "/dev/null";
    process.env["CANONICALS_FILE"] = fixture("canonicals.json");
    process.env["REDIRECTS_FILE"] = fixture("redirects.json");
    await import("./index.js");
    mdnHandler =
      /** @type {(req: Request, res: Response) => void} */
      (getFunction("mdnHandler"));
  });

  it("returns 302 for GET /", async () => {
    const req = createRequest({
      method: "GET",
      url: "/",
      hostname: "localhost",
      headers: { host: "localhost" },
    });
    const res = createResponse();
    mdnHandler(req, res);

    strictEqual(res.statusCode, 302);
  });
});
