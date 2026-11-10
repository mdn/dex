import { after, before, describe, it, mock } from "node:test";
import { strictEqual } from "node:assert/strict";
import { request } from "node:http";

import { startDummyBucket, startHandler } from "./proxy-helpers.js";

describe("request errors", () => {
  /** @type {Awaited<ReturnType<typeof startDummyBucket>>} */
  let bucket;
  /** @type {Awaited<ReturnType<typeof startHandler>>} */
  let handler;

  before(async () => {
    mock.method(console, "warn", () => {});
    bucket = await startDummyBucket({});
    handler = await startHandler(bucket.url);
  });

  after(async () => {
    await handler?.close();
    await bucket?.close();
    mock.restoreAll();
  });

  /**
   * Sends the request as is, as `fetch` would normalize it, and fails
   * instead of waiting for the function timeout.
   * @param {{ path: string, method?: string, headers?: Record<string, string>, body?: string }} options
   * @returns {Promise<number | undefined>}
   */
  const send = ({ path, method = "GET", headers = {}, body }) =>
    new Promise((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port: handler.port, path, method, headers },
        (res) => {
          res.on("end", () => resolve(res.statusCode));
          res.on("error", reject);
          res.on("aborted", () => reject(new Error("Response aborted")));
          res.resume();
        }
      );
      req.setTimeout(2000, () => req.destroy(new Error("No response")));
      req.on("error", reject).end(body);
    });

  const cases = [
    {
      label: "malformed percent-encoding",
      path: "/en-US/docs/%E0%A4%A",
      expected: 400,
    },
    {
      label: "malformed percent-encoding in a POST",
      path: "/%E0%A4%A",
      method: "POST",
      expected: 400,
    },
    {
      label: "malformed percent-encoding on /pimg",
      path: "/pimg/%E0%A4%A",
      expected: 400,
    },
    {
      label: "invalid Referer on /pong/click",
      path: "/pong/click?code=x",
      headers: { referer: "x" },
      expected: 400,
    },
    {
      label: "missing body on /pong/get",
      path: "/pong/get",
      method: "POST",
      expected: 400,
    },
    {
      label: "malformed JSON body on /pong/get",
      path: "/pong/get",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
      expected: 400,
    },
    {
      label: "JSON preferredlocale cookie",
      path: "/en-US/docs/Web",
      headers: { cookie: "preferredlocale=j:{}" },
      expected: 404,
    },
    {
      label: "undecodable runner state",
      path: "/runner.html?state=AAAA",
      headers: { "sec-fetch-dest": "iframe", referer: "http://127.0.0.1/" },
      expected: 400,
    },
  ];

  for (const { label, expected, ...options } of cases) {
    it(`responds ${expected} to ${label}`, async () => {
      strictEqual(await send(options), expected);
    });
  }
});
