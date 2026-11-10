import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { createRequest, createResponse } from "node-mocks-http";

import { rejectDotSegments } from "./reject-dot-segments.js";

/** @param {string} url */
async function run(url) {
  const req = createRequest({ method: "GET", url });
  const res = createResponse();
  let nextCalled = false;
  await rejectDotSegments(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

describe("rejectDotSegments", () => {
  const rejected = [
    { label: "parent segment", url: "/assets/../../other/x" },
    { label: "current segment", url: "/assets/./x" },
    { label: "trailing parent segment", url: "/assets/.." },
    { label: "parent segment before a query", url: "/assets/..?q=1" },
    { label: "encoded current segment", url: "/assets/%2e/x" },
    { label: "encoded parent segment", url: "/assets/%2e%2e/x" },
    { label: "half-encoded parent segment", url: "/assets/%2e./x" },
    { label: "mixed-case encoded segment", url: "/assets/.%2E/x" },
    { label: "backslash", url: String.raw`/assets/..\..\other/x` },
    { label: "parent segment before a fragment", url: "/assets/x/..#frag" },
  ];

  for (const { label, url } of rejected) {
    it(`rejects a ${label}: ${url}`, async () => {
      const { res, nextCalled } = await run(url);
      strictEqual(nextCalled, false);
      strictEqual(res.statusCode, 400);
    });
  }

  const allowed = [
    { label: "doc page", url: "/en-US/docs/Web/API" },
    { label: "dots inside a segment", url: "/en-US/docs/Web/API/Element.foo" },
    { label: "triple dots", url: "/en-US/docs/.../x" },
    { label: "dots in the query string", url: "/en-US/search?q=../x" },
  ];

  for (const { label, url } of allowed) {
    it(`allows a ${label}: ${url}`, async () => {
      const { nextCalled } = await run(url);
      strictEqual(nextCalled, true);
    });
  }
});
