import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { createRequest, createResponse } from "node-mocks-http";

import { handleSearchSuggestions } from "./handle-search-suggestions.js";
import { clearSearchIndexCache } from "../internal/quicksearch/index.js";

const INDEX = [
  { title: "Array", url: "/en-US/docs/Web/JavaScript/Reference/Array" },
  {
    title: "Array.prototype.map()",
    url: "/en-US/docs/Web/JavaScript/Reference/Array/map",
  },
  {
    title: "length",
    url: "/en-US/docs/Web/JavaScript/Reference/Array/length",
  },
  { title: "length", url: "/en-US/docs/Web/API/FileList/length" },
];

/**
 * @param {string} q
 * @param {{ query?: Record<string, string> }} [opts]
 */
function request(q, { query = {} } = {}) {
  return createRequest({
    method: "GET",
    url: "/api/v1/search/suggestions",
    query: { q, ...query },
  });
}

describe("handleSearchSuggestions", () => {
  /** @type {string[]} */
  let fetchedUrls;

  beforeEach(() => {
    clearSearchIndexCache();
    fetchedUrls = [];
    mock.method(globalThis, "fetch", async (/** @type {string} */ url) => {
      fetchedUrls.push(url);
      return Response.json(INDEX);
    });
  });

  afterEach(() => {
    mock.reset();
  });

  it("returns OpenSearch suggestions JSON for a query", async () => {
    const req = request("array map");
    const res = createResponse();
    await handleSearchSuggestions(req, res);

    strictEqual(res.statusCode, 200);
    strictEqual(
      res.getHeader("Content-Type"),
      "application/x-suggestions+json; charset=utf-8"
    );
    deepStrictEqual(res._getJSONData(), [
      "array map",
      ["Array.prototype.map()"],
    ]);
  });

  it("appends breadcrumb context to titles shared by several pages", async () => {
    const req = request("length");
    const res = createResponse();
    await handleSearchSuggestions(req, res);

    deepStrictEqual(res._getJSONData(), [
      "length",
      ["length (JavaScript)", "length (Web APIs)"],
    ]);
  });

  it("returns an empty suggestion list for an empty query", async () => {
    const req = request("");
    const res = createResponse();
    await handleSearchSuggestions(req, res);

    strictEqual(res.statusCode, 200);
    deepStrictEqual(res._getJSONData(), ["", []]);
    deepStrictEqual(fetchedUrls, []);
  });

  it("uses the locale query parameter", async () => {
    const req = request("array", { query: { locale: "fr" } });
    const res = createResponse();
    await handleSearchSuggestions(req, res);

    strictEqual(fetchedUrls.length, 1);
    strictEqual(fetchedUrls[0]?.endsWith("fr/search-index.json"), true);
  });

  it("defaults to en-US for an invalid locale query parameter", async () => {
    const req = request("array", { query: { locale: "xx-invalid" } });
    const res = createResponse();
    await handleSearchSuggestions(req, res);

    strictEqual(fetchedUrls[0]?.endsWith("en-us/search-index.json"), true);
  });

  it("caches the index across requests for the same locale", async () => {
    await handleSearchSuggestions(request("array"), createResponse());
    await handleSearchSuggestions(request("map"), createResponse());

    strictEqual(fetchedUrls.length, 1);
  });
});
