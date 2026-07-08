import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { createRequest, createResponse } from "node-mocks-http";

import { lowercasePathname } from "./lowercase-pathname.js";

/** @param {string} url */
async function run(url) {
  const req = createRequest({
    method: "GET",
    url,
    protocol: "https",
    hostname: "developer.mozilla.org",
    headers: { host: "developer.mozilla.org" },
  });
  const res = createResponse();
  let nextCalled = false;
  await lowercasePathname(req, res, () => {
    nextCalled = true;
  });
  return { req, nextCalled };
}

describe("lowercasePathname", () => {
  /** @type {Array<[label: string, url: string, expected: string]>} */
  const cases = [
    [
      "lowercases the pathname and keeps req.url path-relative",
      "/EN-US/search-index.json",
      "/en-us/search-index.json",
    ],
    [
      "leaves an already-lowercase pathname unchanged",
      "/en-us/search-index.json",
      "/en-us/search-index.json",
    ],
    [
      "preserves the query string",
      "/EN-US/search-index.json?Foo=Bar",
      "/en-us/search-index.json?Foo=Bar",
    ],
    [
      "preserves the fragment",
      "/EN-US/docs/Web/API#Section",
      "/en-us/docs/web/api#Section",
    ],
    [
      "preserves the query string and fragment together",
      "/EN-US/docs/Web/API?Foo=Bar#Section",
      "/en-us/docs/web/api?Foo=Bar#Section",
    ],
  ];

  for (const [label, url, expected] of cases) {
    it(`${label}: ${url} → ${expected}`, async () => {
      const { req } = await run(url);
      strictEqual(req.url, expected);
    });
  }

  it("calls next()", async () => {
    const { nextCalled } = await run("/EN-US/search-index.json");
    strictEqual(nextCalled, true);
  });
});
