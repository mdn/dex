/** @import { Request, Response } from "express" */

import { readFile } from "node:fs/promises";
import * as path from "node:path";

import { VALID_LOCALES } from "../internal/constants/index.js";
import { slugToFolder } from "../internal/slug-utils/index.js";

import { PROXY_TIMEOUT } from "../constants.js";
import { WIKIHISTORY_DIR } from "../env.js";
import { getCacheControl, setContentResponseHeaders } from "../headers.js";
import { discardBody } from "../utils.js";
import { getContentTarget } from "./proxy-content.js";

/** @type {Map<string, Promise<Record<string, string[]>>>} */
const wikiHistoryCache = new Map();

/**
 * Serve a doc's `contributors.txt`, in the format previously written by rari.
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @returns {Promise<void>}
 */
export async function handleContributors(req, res) {
  const target = getContentTarget(req);
  const folder = slugToFolder(req.path.slice(1, -"/contributors.txt".length));
  const url = new URL(`${folder}/metadata.json`, target);
  // Ensure the resolved URL stays within the content prefix.
  if (!url.href.startsWith(target)) {
    res.sendStatus(400).end();
    return;
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(PROXY_TIMEOUT),
  });

  if (!response.ok) {
    await discardBody(response);
    if (response.status === 404) {
      setHeaders(res);
      res.status(404).set("Cache-Control", "no-store").type("text").send();
      return;
    }
    throw badGateway(`Unexpected metadata.json status: ${response.status}`);
  }

  /** @type {any} */
  const metadata = await response.json().catch(() => null);
  const githubUrl = metadata?.source?.github_url;
  const [, locale, slug] =
    String(metadata?.mdn_url).match(/^\/([^/]+)\/docs\/(.+)$/) ?? [];
  if (typeof githubUrl !== "string" || !locale || !slug) {
    throw badGateway(`Invalid metadata.json for ${req.path}`);
  }

  const history = await getWikiHistory(locale);
  const contributors = Object.hasOwn(history, slug) ? history[slug] : null;

  let body = `# Contributors by commit history\n${githubUrl.replace("/blob/", "/commits/")}\n\n`;
  if (Array.isArray(contributors) && contributors.length > 0) {
    body += `# Original Wiki contributors\n${contributors.join("\n")}\n`;
  }

  setHeaders(res);
  const cacheControl = getCacheControl(200, req.path);
  if (cacheControl) {
    res.set("Cache-Control", cacheControl);
  }
  res.type("text").send(body);
}

/**
 * @param {Response} res - Express response
 * @returns {void}
 */
function setHeaders(res) {
  setContentResponseHeaders((name, value) => res.setHeader(name, value), {
    csp: false,
  });
  res.set("X-Robots-Tag", "noindex, nofollow");
}

/**
 * @param {string} message
 * @returns {Error & { status: number }}
 */
function badGateway(message) {
  return Object.assign(new Error(message), { status: 502 });
}

/**
 * Lazily load the original wiki contributors of a locale, keyed by slug.
 * @param {string} locale - Locale from the doc's `mdn_url` (e.g. "en-US")
 * @returns {Promise<Record<string, string[]>>}
 */
function getWikiHistory(locale) {
  const key = locale.toLowerCase();
  if (!VALID_LOCALES.has(key)) {
    return Promise.resolve({});
  }

  let history = wikiHistoryCache.get(key);
  if (!history) {
    history = readFile(path.join(WIKIHISTORY_DIR, `${key}.json`), "utf-8")
      .then((json) => JSON.parse(json))
      .catch((error) => {
        // Not every locale has wiki history.
        if (error?.code === "ENOENT") {
          return {};
        }
        wikiHistoryCache.delete(key);
        throw error;
      });
    wikiHistoryCache.set(key, history);
  }
  return history;
}
