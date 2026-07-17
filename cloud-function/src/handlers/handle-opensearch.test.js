import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { createRequest, createResponse } from "node-mocks-http";

import { handleOpenSearch } from "./handle-opensearch.js";
import { BASE_URL_MAIN } from "../env.js";

/**
 * @param {Record<string, string>} [query]
 */
function request(query = {}) {
  return createRequest({
    method: "GET",
    url: "/opensearch.xml",
    query,
  });
}

describe("handleOpenSearch", () => {
  it("serves an OpenSearch description document", () => {
    const res = createResponse();
    handleOpenSearch(request({ locale: "en-US" }), res);

    strictEqual(res.statusCode, 200);
    strictEqual(
      res.getHeader("Content-Type"),
      "application/opensearchdescription+xml; charset=utf-8"
    );
    const xml = res._getData();
    strictEqual(xml.includes("<OpenSearchDescription"), true);
  });

  it("uses a plain MDN name for the default locale", () => {
    const res = createResponse();
    handleOpenSearch(request({ locale: "en-US" }), res);
    const xml = res._getData();

    strictEqual(xml.includes("<ShortName>MDN</ShortName>"), true);
  });

  it("labels the engine with non-default locales", () => {
    const res = createResponse();
    handleOpenSearch(request({ locale: "de" }), res);
    const xml = res._getData();

    strictEqual(xml.includes("<ShortName>MDN (de)</ShortName>"), true);
  });

  it("bakes the locale into absolute suggestions and search endpoint URLs", () => {
    const res = createResponse();
    handleOpenSearch(request({ locale: "de" }), res);
    const xml = res._getData();

    strictEqual(
      xml.includes(
        `${BASE_URL_MAIN}/api/v1/search/suggestions?q={searchTerms}&amp;locale=de`
      ),
      true
    );
    strictEqual(
      xml.includes(
        `${BASE_URL_MAIN}/api/v1/search/go?q={searchTerms}&amp;locale=de`
      ),
      true
    );
  });

  it("includes a Description element for spec compliance", () => {
    const res = createResponse();
    handleOpenSearch(request({ locale: "de" }), res);
    const xml = res._getData();

    strictEqual(xml.includes("<Description>"), true);
  });

  it("includes a self-referential rel=self Url with the absolute descriptor URL", () => {
    const res = createResponse();
    handleOpenSearch(request({ locale: "de" }), res);
    const xml = res._getData();

    strictEqual(
      xml.includes(
        `<Url type="application/opensearchdescription+xml" rel="self" template="${BASE_URL_MAIN}/opensearch.xml?locale=de"/>`
      ),
      true
    );
  });

  it("normalises the locale to its canonical casing", () => {
    const res = createResponse();
    handleOpenSearch(request({ locale: "PT-br" }), res);
    const xml = res._getData();

    strictEqual(xml.includes("<ShortName>MDN (pt-BR)</ShortName>"), true);
    strictEqual(
      xml.includes(
        `${BASE_URL_MAIN}/api/v1/search/suggestions?q={searchTerms}&amp;locale=pt-BR`
      ),
      true
    );
  });

  it("defaults to en-US for an invalid query parameter", () => {
    const res = createResponse();
    handleOpenSearch(request({ locale: "xx-invalid" }), res);
    const xml = res._getData();

    strictEqual(xml.includes("<ShortName>MDN</ShortName>"), true);
    strictEqual(
      xml.includes(
        `${BASE_URL_MAIN}/api/v1/search/suggestions?q={searchTerms}&amp;locale=en-US`
      ),
      true
    );
  });

  it("defaults to en-US when no locale is given", () => {
    const res = createResponse();
    handleOpenSearch(request({}), res);
    const xml = res._getData();

    strictEqual(xml.includes("<ShortName>MDN</ShortName>"), true);
    strictEqual(
      xml.includes(
        `${BASE_URL_MAIN}/api/v1/search/go?q={searchTerms}&amp;locale=en-US`
      ),
      true
    );
  });
});
