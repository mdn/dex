/**
 * @import { SearchIndexEntry, SearchIndexItem, SearchIndex } from "./types.js"
 */

import { Source, sourceUri } from "../../env.js";
import { ACTIVE_LOCALES } from "../constants/index.js";

const DEFAULT_LOCALE = "en-us";
const MAX_RESULTS = 10;

/**
 * @param {string} value
 * @returns {string}
 */
function normalize(value) {
  return value.trim().toLowerCase();
}

/**
 * Builds the in-memory search index from raw `search-index.json` entries. The
 * `flex` array is fred's `_fetchIndex` shape (search-modal/element.js); the
 * per-item `label` and the `byLabel` map are cloud-function additions that power
 * label disambiguation and exact-match lookup, with no fred equivalent.
 * @param {SearchIndexEntry[]} entries
 * @returns {SearchIndex}
 */
export function buildIndex(entries) {
  const flex = entries.map(({ title, url }, index) => ({
    index,
    title: title.toLowerCase(),
    slugTail: url.split("/").pop()?.toLowerCase() || "",
  }));

  // Group entry indices by exact title so a title shared by several pages can be
  // disambiguated with the shortest distinguishing breadcrumb prefix.
  /** @type {Map<string, number[]>} */
  const byTitle = new Map();
  entries.forEach((entry, i) => {
    const group = byTitle.get(entry.title);
    if (group) {
      group.push(i);
    } else {
      byTitle.set(entry.title, [i]);
    }
  });

  const items = entries.map((entry, i) => {
    const group = byTitle.get(entry.title) ?? [i];
    return { ...entry, label: generateLabel(entry, i, group, entries) };
  });

  /** @type {Map<string, SearchIndexItem | null>} */
  const byLabel = new Map();
  items.forEach((item) => {
    const key = normalize(item.label);
    byLabel.set(key, byLabel.has(key) ? null : item);
  });

  return { flex, items, byLabel };
}

/**
 * Ported from fred's `quickSearch` (search-modal/element.js).
 * @param {string} input
 * @param {SearchIndex} index
 * @returns {SearchIndexItem[]}
 */
export function quickSearch(input, index) {
  const inputValueLC = normalize(input);
  if (!inputValueLC) {
    return [];
  }
  const q = splitQuery(input);
  const indexResults = index.flex
    .filter(({ title }) => q.every((q) => title.includes(q)))
    .map(({ index, title, slugTail }) => {
      const exact = Number([title, slugTail].includes(inputValueLC));
      return /** @type {const} */ ([exact, index]);
    })
    .sort(([aExact], [bExact]) => bExact - aExact) // Boost exact matches.
    .map(([_, i]) => i)
    .slice(0, MAX_RESULTS);

  return indexResults
    .map((i) => index.items[i])
    .filter((item) => item !== undefined);
}

/**
 * Resolves a query to a single page when it exactly matches one suggestion label.
 * @param {string} query
 * @param {SearchIndex} index
 * @returns {SearchIndexItem | null}
 */
export function findExactMatch(query, index) {
  return index.byLabel.get(normalize(query)) ?? null;
}

/**
 * Breadcrumb segments for an MDN doc URL: ported from `mdnUrl2Breadcrumb`
 * (utils/mdn-url2breadcrumb.js) in fred.
 * @param {string} url
 * @returns {string[]}
 */
function breadcrumbParts(url) {
  const locale = url.split("/")[1] ?? "";
  let parents = url
    .replaceAll("_", " ")
    .split("/")
    .filter((p) => !["", locale, "docs"].includes(p));

  if (parents.at(0) === "Web" && parents.at(1) === "API") {
    parents[1] = "Web APIs";
  }

  if (parents.length > 1 && parents.at(0) === "Web") {
    parents.splice(0, 1);
  }

  if (parents.length > 1) {
    parents.splice(-1, 1);
  }

  return parents;
}

/**
 * Separate from `breadcrumbParts` to keep that close to fred's implementation.
 * @param {string} url
 * @returns {string[]}
 */
function labelBreadcrumb(url) {
  const parts = breadcrumbParts(url);
  const skipSlugs = ["Mozilla/Add-ons", "Mozilla"];
  for (const slug of skipSlugs) {
    const skipParts = slug.split("/");
    if (
      parts.length > skipParts.length &&
      skipParts.every((part, i) => part === parts[i])
    ) {
      return parts.slice(skipParts.length);
    }
  }
  return parts;
}

/**
 * @param {SearchIndexEntry} entry
 * @param {number} index - `entry`'s own position in `entries`
 * @param {number[]} group - indices of all entries sharing `entry.title`
 * @param {SearchIndexEntry[]} entries
 * @returns {string}
 */
function generateLabel(entry, index, group, entries) {
  // Firefox drops "url-like" suggestions (bug 2061842)
  const urlLike = !/\s/.test(entry.title) && /[/@:[.]/.test(entry.title);
  if (group.length <= 1 && !urlLike) {
    return entry.title;
  }
  const parts = labelBreadcrumb(entry.url);
  const others = group
    .filter((i) => i !== index)
    .map((i) => {
      const other = entries[i];
      return other ? labelBreadcrumb(other.url) : [];
    });
  // The shortest leading breadcrumb segments that set this entry apart from
  // every sibling, falling back to the full breadcrumb when one is identical.
  const prefixLength = parts
    .map((_, i) => i + 1)
    .find((length) =>
      others.every((otherParts) => !prefixEquals(parts, otherParts, length))
    );
  const suffix = parts.slice(0, prefixLength ?? parts.length).join(" / ");
  // Drop a suffix that is empty or merely repeats the title (e.g. the
  // "JavaScript" page that sits directly under the JavaScript section); the
  // bare title stays unique because its siblings keep their distinct suffixes.
  return suffix && suffix !== entry.title
    ? `${entry.title} (${suffix})`
    : entry.title;
}

/**
 * Whether `b` starts with the first `length` segments of `a`.
 * @param {string[]} a
 * @param {string[]} b
 * @param {number} length
 * @returns {boolean}
 */
function prefixEquals(a, b, length) {
  return a.slice(0, length).every((value, i) => value === b[i]);
}

/**
 * Ported from fred's `splitQuery` (search-modal/element.js).
 * @param {string} term
 * @returns {string[]}
 */
export function splitQuery(term) {
  term = normalize(term);
  return term.startsWith(".") || term.endsWith(".")
    ? // Dot is probably meaningful.
      term.split(/[ ,]+/)
    : // Dot is probably just a word separator.
      term.split(/[ ,.]+/);
}

/**
 * Per-locale cache of the parsed search index.
 * @type {Map<string, Promise<SearchIndex>>}
 */
const indexCache = new Map();

/**
 * @param {string} [locale]
 * @returns {Promise<SearchIndex>}
 */
export function getSearchIndex(locale) {
  const lowered = (locale || DEFAULT_LOCALE).toLowerCase();
  const normalized = ACTIVE_LOCALES.has(lowered) ? lowered : DEFAULT_LOCALE;

  const cached = indexCache.get(normalized);
  if (cached) {
    return cached;
  }

  const index = loadSearchIndex(normalized);
  indexCache.set(normalized, index);
  return index;
}

/**
 * Server-side counterpart to fred's `_fetchIndex` (search-modal/element.js)
 * @param {string} locale
 * @returns {Promise<SearchIndex>}
 */
async function loadSearchIndex(locale) {
  try {
    const target = sourceUri(Source.content);
    const response = await fetch(`${target}${locale}/search-index.json`);
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    /** @type {SearchIndexEntry[]} */
    const entries = await response.json();
    return buildIndex(entries);
  } catch (error) {
    indexCache.delete(locale);
    throw error;
  }
}

export function clearSearchIndexCache() {
  indexCache.clear();
}
