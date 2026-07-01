/** @import { Request, Response } from "express" */

import { DEFAULT_LOCALE } from "../internal/constants/index.js";
import { getQueryLocale } from "../internal/locale-utils/index.js";
import { BASE_URL_MAIN } from "../env.js";

/**
 * Serve the OpenSearch description document.
 * @param {Request} req
 * @param {Response} res
 * @returns {Response}
 */
export function handleOpenSearch(req, res) {
  const locale = getQueryLocale(req);
  const shortName = locale === DEFAULT_LOCALE ? "MDN" : `MDN (${locale})`;

  const suggestionsUrl = `${BASE_URL_MAIN}/api/v1/search/suggestions?q={searchTerms}&amp;locale=${locale}`;
  const searchUrl = `${BASE_URL_MAIN}/api/v1/search/go?q={searchTerms}&amp;locale=${locale}`;
  const descriptorUrl = `${BASE_URL_MAIN}/opensearch.xml?locale=${locale}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${shortName}</ShortName>
  <Description>Search MDN Web Docs</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="16" height="16" type="image/x-icon">${BASE_URL_MAIN}/favicon.ico</Image>
  <Url type="application/x-suggestions+json" method="get" template="${suggestionsUrl}"/>
  <Url type="text/html" method="get" template="${searchUrl}"/>
  <Url type="application/opensearchdescription+xml" rel="self" template="${descriptorUrl}"/>
</OpenSearchDescription>
`;

  res.setHeader(
    "Content-Type",
    "application/opensearchdescription+xml; charset=utf-8"
  );
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).send(xml);
}
