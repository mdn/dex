import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { strictEqual } from "node:assert/strict";
import { createRequest, createResponse } from "node-mocks-http";

import { handleSearchRedirect } from "./handle-search-redirect.js";
import { clearSearchIndexCache } from "../internal/quicksearch/index.js";
import { BASE_URL_MAIN } from "../env.js";

const INDEX = [
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

const FR_INDEX = [
  {
    title: "Array.prototype.map()",
    url: "/fr/docs/Web/JavaScript/Reference/Array/map",
  },
];

/**
 * @param {string} q
 * @param {{ query?: Record<string, string> }} [opts]
 */
function request(q, { query = {} } = {}) {
  return createRequest({
    method: "GET",
    url: "/api/v1/search/go",
    query: { q, ...query },
  });
}

describe("handleSearchRedirect", () => {
  /** @type {string[]} */
  let fetchedUrls;

  beforeEach(() => {
    clearSearchIndexCache();
    fetchedUrls = [];
    mock.method(globalThis, "fetch", async (/** @type {string} */ url) => {
      fetchedUrls.push(url);
      const index = url.includes("/fr/search-index.json") ? FR_INDEX : INDEX;
      return Response.json(index);
    });
  });

  afterEach(() => {
    mock.reset();
  });

  it("redirects an exact unique title match to its page", async () => {
    const req = request("Array.prototype.map()");
    const res = createResponse();
    await handleSearchRedirect(req, res);

    strictEqual(res.statusCode, 302);
    strictEqual(
      res._getRedirectUrl(),
      `${BASE_URL_MAIN}/en-US/docs/Web/JavaScript/Reference/Array/map`
    );
  });

  it("redirects a disambiguated label match", async () => {
    const req = request("length (Web APIs)");
    const res = createResponse();
    await handleSearchRedirect(req, res);

    strictEqual(
      res._getRedirectUrl(),
      `${BASE_URL_MAIN}/en-US/docs/Web/API/FileList/length`
    );
  });

  it("hands a title shared by several pages to the results page", async () => {
    const req = request("length");
    const res = createResponse();
    await handleSearchRedirect(req, res);

    strictEqual(res.statusCode, 302);
    strictEqual(
      res._getRedirectUrl(),
      `${BASE_URL_MAIN}/en-US/search?q=length`
    );
  });

  it("hands a non-matching query to the results page", async () => {
    const req = request("nonexistent page");
    const res = createResponse();
    await handleSearchRedirect(req, res);

    strictEqual(
      res._getRedirectUrl(),
      `${BASE_URL_MAIN}/en-US/search?q=nonexistent+page`
    );
  });

  it("redirects an empty query to the results page without fetching", async () => {
    const req = request("");
    const res = createResponse();
    await handleSearchRedirect(req, res);

    strictEqual(res._getRedirectUrl(), `${BASE_URL_MAIN}/en-US/search?q=`);
    strictEqual(fetchedUrls.length, 0);
  });

  it("uses the locale query parameter when matching", async () => {
    const req = request("array", { query: { locale: "fr" } });
    const res = createResponse();
    await handleSearchRedirect(req, res);

    strictEqual(fetchedUrls[0]?.endsWith("fr/search-index.json"), true);
  });

  it("redirects an exact match to the page in the locale query parameter", async () => {
    const req = request("Array.prototype.map()", { query: { locale: "fr" } });
    const res = createResponse();
    await handleSearchRedirect(req, res);

    strictEqual(res.statusCode, 302);
    strictEqual(
      res._getRedirectUrl(),
      `${BASE_URL_MAIN}/fr/docs/Web/JavaScript/Reference/Array/map`
    );
  });

  it("uses the locale query parameter on the fallback results page", async () => {
    const req = request("nonexistent", { query: { locale: "fr" } });
    const res = createResponse();
    await handleSearchRedirect(req, res);

    strictEqual(
      res._getRedirectUrl(),
      `${BASE_URL_MAIN}/fr/search?q=nonexistent`
    );
  });

  it("defaults to en-US when no locale is given", async () => {
    const req = request("nonexistent");
    const res = createResponse();
    await handleSearchRedirect(req, res);

    strictEqual(
      res._getRedirectUrl(),
      `${BASE_URL_MAIN}/en-US/search?q=nonexistent`
    );
  });
});
