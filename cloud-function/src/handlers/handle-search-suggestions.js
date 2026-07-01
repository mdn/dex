/** @import { Request, Response } from "express" */

import { getSearchIndex, quickSearch } from "../internal/quicksearch/index.js";
import { getQueryLocale } from "../internal/locale-utils/index.js";

/**
 * Returns the OpenSearch Suggestions JSON.
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<Response>}
 */
export async function handleSearchSuggestions(req, res) {
  const query = typeof req.query["q"] === "string" ? req.query["q"] : "";

  res
    .status(200)
    .setHeader("Content-Type", "application/x-suggestions+json; charset=utf-8")
    .setHeader("Cache-Control", "public, max-age=3600");

  const index = query.trim() ? await getSearchIndex(getQueryLocale(req)) : null;
  const results = index ? quickSearch(query, index) : [];
  const completions = results.map(({ label }) => label);

  return res.end(JSON.stringify([query, completions]));
}
