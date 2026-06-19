/** @import { Request, Response } from "express" */

import {
  getSearchIndex,
  findExactMatch,
} from "../internal/quicksearch/index.js";
import { getQueryLocale } from "../internal/locale-utils/index.js";
import { BASE_URL_MAIN } from "../env.js";

/**
 * Handle searches from OpenSearch: when the query exactly matches an entry from
 * the quicksearch index, redirect to it, otherwise redirect to the full-text
 * search results page.
 * @param {Request} req
 * @param {Response} res
 */
export async function handleSearchRedirect(req, res) {
  const query = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";
  const locale = getQueryLocale(req);

  const index = query ? await getSearchIndex(locale) : null;
  const match = index ? findExactMatch(query, index) : null;
  if (match) {
    res.redirect(302, `${BASE_URL_MAIN}${match.url}`);
    return;
  }

  const target = `${BASE_URL_MAIN}/${locale}/search?${new URLSearchParams({ q: query })}`;
  res.redirect(302, target);
}
