import { readFileSync, writeFileSync } from "node:fs";

async function main() {
  const [refPath, inputPath, outputPath = null] = process.argv.slice(2);

  const readJson = (/** @type {string} */ path) =>
    JSON.parse(readFileSync(path, "utf-8"));
  const slugify = (/** @type {string} */ url) =>
    url.replace(/^\/[^/]+\/docs\//, "");

  // Read reference (e.g. "client/build/en-us/search-index.json")
  // into map: slug -> index-in-ref
  const ref = Object.fromEntries(
    readJson(refPath).map(
      (/** @type {{url: string}} */ { url }, /** @type {number} */ i) => [
        slugify(url),
        i,
      ]
    )
  );

  // Read index (e.g. "client/build/de/search-index.json").
  const input = readJson(inputPath);

  // Array of tuples (index-in-ref, input-entry).
  const indexed = input.map(
    (/** @type {{title: string, url: string}} */ { title, url }) => [
      ref[slugify(url)] ?? Infinity,
      { title, url },
    ]
  );
  // Sort by index-in-ref.
  indexed.sort((/** @type {[any]} */ [a], /** @type {[any]} */ [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  const result = indexed.map((/** @type {[any, any]} */ [, entry]) => entry);

  writeFileSync(outputPath ?? inputPath, JSON.stringify(result), "utf-8");
}

try {
  main();
} catch (/** @type {any} */ e) {
  console.error(e);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error::${e.toString()} `);
  }
}
