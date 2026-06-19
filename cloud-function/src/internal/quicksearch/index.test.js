import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

import {
  buildIndex,
  findExactMatch,
  quickSearch,
  splitQuery,
} from "./index.js";

describe("splitQuery", () => {
  it("splits on spaces, commas, and dots when dot is a word separator", () => {
    deepStrictEqual(splitQuery("array for each"), ["array", "for", "each"]);
    deepStrictEqual(splitQuery("array.forEach"), ["array", "foreach"]);
    deepStrictEqual(splitQuery("a, b,c"), ["a", "b", "c"]);
  });

  it("keeps the dot meaningful when it leads or trails", () => {
    deepStrictEqual(splitQuery(".foreach"), [".foreach"]);
    deepStrictEqual(splitQuery("each foreach."), ["each", "foreach."]);
  });

  it("lowercases and trims", () => {
    deepStrictEqual(splitQuery("  Array MAP "), ["array", "map"]);
  });
});

describe("buildIndex", () => {
  it("builds a flex index with lowercased title and slug tail", () => {
    const items = [
      { title: "Array.prototype.map()", url: "/en-US/docs/Web/JS/map" },
      { title: "Array", url: "/en-US/docs/Web/JS/Array" },
    ];
    const { flex, items: kept } = buildIndex(items);
    deepStrictEqual(kept, [
      {
        title: "Array.prototype.map()",
        url: "/en-US/docs/Web/JS/map",
        label: "Array.prototype.map()",
      },
      { title: "Array", url: "/en-US/docs/Web/JS/Array", label: "Array" },
    ]);
    deepStrictEqual(flex, [
      { index: 0, title: "array.prototype.map()", slugTail: "map" },
      { index: 1, title: "array", slugTail: "array" },
    ]);
  });

  it("labels unique titles bare and clashing titles with the shortest distinguishing prefix", () => {
    const { items } = buildIndex([
      { title: "map()", url: "/en-US/docs/Web/JavaScript/Reference/Array/map" },
      {
        title: "length",
        url: "/en-US/docs/Web/JavaScript/Reference/Array/length",
      },
      { title: "length", url: "/en-US/docs/Web/API/FileList/length" },
    ]);
    deepStrictEqual(
      items.map((item) => item.label),
      ["map()", "length (JavaScript)", "length (Web APIs)"]
    );
  });

  it("keeps the title bare when its prefix would just repeat the title", () => {
    const { items, byLabel } = buildIndex([
      { title: "JavaScript", url: "/en-US/docs/Web/JavaScript" },
      { title: "JavaScript", url: "/en-US/docs/Glossary/JavaScript" },
    ]);
    deepStrictEqual(
      items.map((item) => item.label),
      ["JavaScript", "JavaScript (Glossary)"]
    );
    deepStrictEqual(
      byLabel.get("javascript")?.url,
      "/en-US/docs/Web/JavaScript"
    );
  });

  it("extends the prefix only as far as needed to disambiguate", () => {
    const { items } = buildIndex([
      { title: "Iterators", url: "/en-US/docs/Web/JavaScript/Guide/Iterators" },
      {
        title: "Iterators",
        url: "/en-US/docs/Web/JavaScript/Reference/Iterators",
      },
      { title: "Iterators", url: "/en-US/docs/Web/CSS/Iterators" },
    ]);
    deepStrictEqual(
      items.map((item) => item.label),
      [
        "Iterators (JavaScript / Guide)",
        "Iterators (JavaScript / Reference)",
        "Iterators (CSS)",
      ]
    );
  });
});

describe("findExactMatch", () => {
  const index = buildIndex([
    { title: "map()", url: "/en-US/docs/Web/JavaScript/Reference/Array/map" },
    {
      title: "length",
      url: "/en-US/docs/Web/JavaScript/Reference/Array/length",
    },
    { title: "length", url: "/en-US/docs/Web/API/FileList/length" },
    { title: "Overview", url: "/en-US/docs/Web/CSS/Overview/a" },
    { title: "Overview", url: "/en-US/docs/Web/CSS/Overview/b" },
  ]);

  it("matches a unique title case-insensitively", () => {
    deepStrictEqual(
      findExactMatch("MAP()", index)?.url,
      "/en-US/docs/Web/JavaScript/Reference/Array/map"
    );
  });

  it("matches a disambiguated label", () => {
    deepStrictEqual(
      findExactMatch("length (Web APIs)", index)?.url,
      "/en-US/docs/Web/API/FileList/length"
    );
  });

  it("does not match a bare title shared by several pages", () => {
    deepStrictEqual(findExactMatch("length", index), null);
  });

  it("does not match when even the label is shared", () => {
    deepStrictEqual(findExactMatch("Overview (CSS / Overview)", index), null);
  });

  it("returns null for an unknown query", () => {
    deepStrictEqual(findExactMatch("nope", index), null);
  });
});

describe("quickSearch", () => {
  const items = [
    { title: "Array", url: "/en-US/docs/Web/JavaScript/Reference/Array" },
    {
      title: "Array.prototype.map()",
      url: "/en-US/docs/Web/JavaScript/Reference/Array/map",
    },
    {
      title: "Array.prototype.forEach()",
      url: "/en-US/docs/Web/JavaScript/Reference/Array/forEach",
    },
    { title: "Map", url: "/en-US/docs/Web/JavaScript/Reference/Map" },
  ];
  const index = buildIndex(items);

  it("returns items whose title contains every query term", () => {
    const results = quickSearch("array map", index);
    deepStrictEqual(
      results.map((r) => r.title),
      ["Array.prototype.map()"]
    );
  });

  it("boosts exact title matches to the top", () => {
    const results = quickSearch("array", index);
    deepStrictEqual(results[0]?.title, "Array");
  });

  it("includes a label for each result", () => {
    const results = quickSearch("array map", index);
    deepStrictEqual(
      results.map((r) => r.label),
      ["Array.prototype.map()"]
    );
  });

  it("boosts an exact match by the raw title, not the breadcrumbed label", () => {
    const shared = buildIndex([
      { title: "Referencer", url: "/en-US/docs/Web/Glossary/referencer" },
      { title: "Reference", url: "/en-US/docs/Web/CSS/Reference/intro" },
      { title: "Reference", url: "/en-US/docs/Web/HTML/Reference/intro" },
    ]);
    const results = quickSearch("reference", shared);
    strictEqual(results[0]?.label, "Reference (CSS)");
  });

  it("breadcrumbs the label while leaving the title untouched", () => {
    const shared = buildIndex([
      { title: "Reference", url: "/en-US/docs/Web/CSS/Reference/intro" },
      { title: "Reference", url: "/en-US/docs/Web/HTML/Reference/intro" },
    ]);
    const [first] = quickSearch("reference", shared);
    strictEqual(first?.title, "Reference");
    strictEqual(first?.label, "Reference (CSS)");
  });

  it("returns an empty array for an empty query", () => {
    deepStrictEqual(quickSearch("", index), []);
  });

  it("limits the number of results", () => {
    const many = buildIndex(
      Array.from({ length: 25 }, (_, i) => ({
        title: `Array item ${i}`,
        url: `/en-US/docs/item/${i}`,
      }))
    );
    deepStrictEqual(quickSearch("array", many).length, 10);
  });
});
