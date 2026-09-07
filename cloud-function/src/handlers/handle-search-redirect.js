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

  const redirectParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key.startsWith("utm_") && typeof value === "string") {
      redirectParams.set(key, value);
    }
  }

  let index = null;
  if (query) {
    try {
      index = await getSearchIndex(locale);
    } catch (error) {
      console.error("Failed to fetch search index:", error);
      index = null;
    }
  }
  const match = index ? findExactMatch(query, index) : null;
  if (match) {
    let url = `${BASE_URL_MAIN}${match.url}`;
    if (redirectParams.size > 0) {
      url += `?${redirectParams}`;
    }
    res.redirect(302, url);
    return;
  }

  redirectParams.set("q", query);
  const target = `${BASE_URL_MAIN}/${locale}/search?${redirectParams}`;
  res.redirect(302, target);
}
