import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { Client } from "@elastic/elasticsearch";
import { fdir } from "fdir";

import { INDEX_ALIAS_NAME, indexName, settings, mappings } from "./models.js";

/** @import { ErrorCause, IndicesUpdateAliasesAction } from "@elastic/elasticsearch/lib/api/types"); */

/**
 * @typedef {object} SearchDoc
 * @property {string} _id
 * @property {string} title
 * @property {string} body
 * @property {string} summary
 * @property {string} slug
 * @property {string} locale
 * @property {number | undefined} popularity
 */

/**
 * @param {string} buildroot
 * @param {string} url
 */
export async function index(buildroot, url) {
  const client = new Client({ node: url, maxRetries: 4 });
  const health = await client.cluster.health();
  const status = health.status;
  if (!["green", "yellow"].includes(status)) {
    throw new Error(`status ${status} not green or yellow`);
  }

  const files = await walk(buildroot);
  console.log(
    `Found ${files.length.toLocaleString()} (potential) documents to index`
  );

  const index = indexName();
  console.log(
    `Deleting any possible existing index and creating a new one called '${index}'`
  );
  await client.indices.delete({ index, ignore_unavailable: true });
  await client.indices.create({
    index,
    settings,
    mappings,
  });

  async function* generator() {
    for (const file of files) {
      const doc = await toSearch(file);
      if (doc) {
        yield doc;
      }
    }
  }

  let count = 0;
  /** @type {(ErrorCause | null)[]} */
  const errors = [];
  const t0 = Date.now();

  const result = await client.helpers.bulk({
    datasource: generator(),
    onDocument(doc) {
      const _id = doc._id;
      // TODO: maybe don't do this, or fix the types
      // ES will error if we leave the _id field set in the doc
      // @ts-expect-error: deleting a required field
      delete doc._id;
      return { index: { _index: index, _id } };
    },
    onDrop({ error }) {
      errors.push(error);
    },
    onSuccess() {
      count++;
      if (count % 1000 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        process.stderr.write(
          `Indexed ${count.toLocaleString()} (${(count / elapsed).toFixed(1)}/s)\n`
        );
      }
    },
  });

  // Now we're going to bundle the change to set the alias to point
  // to the new index and delete all old indexes.
  // The reason for doing this together in one update is to make it atomic.
  /** @type {IndicesUpdateAliasesAction[]} */
  const aliasUpdates = [{ add: { index, alias: INDEX_ALIAS_NAME } }];
  const existingAliases = await client.indices.getAlias();
  for (const name of Object.keys(existingAliases)) {
    if (name.startsWith(`${INDEX_ALIAS_NAME}_`) && name !== index) {
      aliasUpdates.push({ remove_index: { index: name } });
      console.log(`Delete old index '${name}'`);
    }
  }
  await client.indices.updateAliases({ actions: aliasUpdates });
  console.log(
    `Reassign the '${INDEX_ALIAS_NAME}' alias from old index to ${index}`
  );

  const took = Math.round((Date.now() - t0) / 1000);
  const rate = result.total / took;
  console.log(
    `Took ${took} seconds to index ${result.total.toLocaleString()} documents. ` +
      `Approximately ${rate.toFixed(1)} docs/second`
  );
  console.log(
    `Successful: ${result.successful.toLocaleString()}, failed: ${result.failed.toLocaleString()}`
  );
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    for (const error of errors) {
      console.log(error);
    }
  }
}

/**
 * @param {string} root
 */
async function walk(root) {
  return new fdir()
    .withFullPaths()
    .filter((path, isDirectory) => !isDirectory && path.endsWith("/index.json"))
    .crawl(root)
    .withPromise();
}

/**
 * @param {string} file
 * @returns {Promise<SearchDoc | undefined>}
 */
async function toSearch(file) {
  /** @type {import("@mdn/rari").BuiltPage} */
  const data = JSON.parse(await readFile(file, "utf8"));
  if (data.renderer !== "Doc") {
    return;
  }
  const doc = data.doc;

  let [locale, ...slugParts] = doc.mdn_url.split("/docs/");
  const slug = slugParts.join("/docs/");
  if (!locale) {
    return;
  }
  if (slug.endsWith("/Index")) {
    // We have a lot of pages that uses the `{{Index(...)}}` kumascript macro
    // which can produce enormous pages whose content is rather useless
    // because it's only an index and thus should appear, individually,
    // elsewhere. Just skip these.
    // E.g. https://developer.allizom.org/en-US/docs/Web/API/Index
    // See also https://github.com/mdn/yari/issues/1786
    // TODO: replace with page-type = landing-page check?
    return;
  }
  if (doc.noIndexing) {
    return;
  }
  if (!doc.body) {
    return;
  }
  locale = locale.slice(1);

  return {
    _id: doc.mdn_url,
    title: doc.title,
    body: htmlStrip(
      doc.body
        .filter((x) => x.type === "prose" && x.value.content)
        .map((x) => x.value.content ?? "")
        .filter(Boolean)
        .join("\n")
    ),
    popularity: doc.popularity ?? undefined,
    summary: doc.summary ?? "",
    // Note! We're always lowercasing the 'slug'. This way we can search on it,
    // still as a `keyword` index, but filtering by prefix.
    // E.g. in kuma; ?slug_prefix=weB/Css
    // But this means that a little bit of information is lost. However, when
    // Dex displays search results, it doesn't use this `slug` value to
    // make the URLs in the search results listings. It's using the `mdn_url`
    // for that.
    // But all of this means; remember to lowercase your `slug` before using
    // it as a filter.
    slug: slug.toLowerCase(),
    locale: locale.toLowerCase(),
  };
}

const _displayNoneRegex = /display:\s*none/;

/**
 * Return the plain text of a blob of MDN HTML.
 *
 * But before giving back the plain text, strip out certain tags because
 * they are not something you see anyway when view the page.
 * The kind of plain text we want is what you'd get, as a browser user,
 * if you use the mouse to select the text and copy and paste it into notepadself.
 *
 * See https://www.peterbe.com/plog/selectolax-or-pyquery for why selectolax
 * is a powerful and performant tool for this.
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlStrip(html) {
  html = html.trim();
  if (!html) {
    return "";
  }
  const $ = load(html);
  $("div.warning, div.hidden, p.hidden").remove();
  $("div[style]")
    .filter((_i, tag) => {
      const style = $(tag).attr("style") ?? "";
      return _displayNoneRegex.test(style);
    })
    .remove();
  const text = $.text();
  return text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join("\n");
}
