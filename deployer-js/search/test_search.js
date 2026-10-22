import { test } from "node:test";
import assert from "node:assert/strict";

import { htmlStrip, htmlToSearchFields, slugLeaf } from "./index.js";
import { mappings, settings } from "./models.js";

test("html_strip basic", () => {
  const html = "<p>Hej då<p>";
  const text = "Hej då";
  assert.equal(htmlStrip(html), text);
});

test("html_strip advanced", () => {
  const html = `
    <div class="warning">This should get stripped.</div>
    <p>Please keep.</p>
    <div class="hidden">
    <h6 id="Playable_code">Playable code</h6>
    </div>
    <div style="display: none">This should also get stripped.</div>
    <div style="foo:bar;display:none;fun:k">This should also get stripped.</div>
    <div style="foo:bar;">Expect to keep this</div>
  `;
  const result = htmlStrip(html);
  assert.ok(!result.includes("This should get stripped"));
  assert.ok(result.includes("Please keep."));
  assert.ok(!result.includes("Playable code"));
  assert.ok(!result.includes("This should also get stripped"));
  assert.ok(result.includes("Expect to keep this"));
});

test("inline code extraction excludes hidden and preformatted code", () => {
  const html = `
    <p>Call <code>Array.prototype.map()</code> with <code>no-store</code>.</p>
    <p><code>::before</code> is a pseudo-element.</p>
    <p class="hidden"><code>hiddenCode</code></p>
    <div class="warning"><code>warningCode</code></div>
    <div style="display: none"><code>displayNoneCode</code></div>
    <pre><code>exampleOnly()</code></pre>
  `;
  const result = htmlToSearchFields(html);

  assert.deepEqual(result.inlineCode, [
    "Array.prototype.map()",
    "no-store",
    "::before",
  ]);
  assert.ok(result.body.includes("exampleOnly()"));
  assert.ok(!result.inlineCode.includes("exampleOnly()"));
  assert.ok(
    !result.inlineCode.some((code) => /hidden|warning|displayNone/.test(code))
  );
});

test("inline code mapping supports exact punctuation and identifier prefixes", () => {
  const inlineCode = mappings.properties?.["inline_code"];
  assert.ok(inlineCode && inlineCode.type === "text");
  if (inlineCode.type !== "text") {
    return;
  }
  const exact = inlineCode.fields?.["exact"];
  const partial = inlineCode.fields?.["partial"];
  assert.ok(exact && exact.type === "keyword");
  assert.ok(partial && partial.type === "text");

  assert.equal(inlineCode.type, "text");
  assert.equal(exact.normalizer, "lowercase_normalizer");
  assert.equal(partial.analyzer, "code_partial_analyzer");
  assert.equal(partial.search_analyzer, "code_analyzer");
  assert.deepEqual(settings.analysis?.filter?.["code_edge_ngram"], {
    type: "edge_ngram",
    min_gram: 2,
    max_gram: 30,
    preserve_original: true,
  });
});

test("slugLeaf returns the lowercased last slug segment", async (t) => {
  const cases = [
    {
      slug: "Web/JavaScript/Reference/Global_Objects/Promise/then",
      expected: "then",
    },
    { slug: "Web/HTML/Reference/Elements/a", expected: "a" },
    { slug: "Web/CSS/Reference/Selectors/::before", expected: "::before" },
    { slug: "Glossary", expected: "glossary" },
  ];
  for (const { slug, expected } of cases) {
    await t.test(slug, () => assert.equal(slugLeaf(slug), expected));
  }
});

test("search field mappings", async (t) => {
  const properties = mappings.properties ?? {};
  /** @param {string} path */
  const field = (path) => {
    const [name = "", sub] = path.split(".");
    const property = properties[name];
    return sub && property && "fields" in property
      ? property.fields?.[sub]
      : property;
  };
  const cases = [
    {
      path: "title.code",
      expected: { type: "text", analyzer: "punctuation_analyzer" },
    },
    {
      path: "summary.code",
      expected: { type: "text", analyzer: "punctuation_analyzer" },
    },
    { path: "slug_leaf", expected: { type: "keyword" } },
    {
      path: "title.joined",
      expected: {
        type: "text",
        analyzer: "joined_analyzer",
        search_analyzer: "standard",
      },
    },
  ];
  for (const { path, expected } of cases) {
    await t.test(path, () => assert.deepEqual(field(path), expected));
  }
});

const searchTestUrl = process.env["SEARCH_TEST_ELASTICSEARCH_URL"];

test(
  "search analyzers tokenize titles and summaries",
  {
    skip:
      !searchTestUrl &&
      "set SEARCH_TEST_ELASTICSEARCH_URL to run Elasticsearch analyzer tests",
  },
  async (t) => {
    if (!searchTestUrl) {
      return;
    }
    const { Client } = await import("@elastic/elasticsearch");
    const client = new Client({ node: searchTestUrl });
    t.after(() => client.close());
    const analysis = settings.analysis ?? {};

    // Inline definitions, so that no index needs to be created.
    /** @param {string} name */
    const inline = (name) => {
      const analyzer = analysis.analyzer?.[name];
      assert.ok(analyzer && analyzer.type === "custom");
      const tokenizer =
        typeof analyzer.tokenizer === "string"
          ? (analysis.tokenizer?.[analyzer.tokenizer] ?? analyzer.tokenizer)
          : analyzer.tokenizer;
      const filter = [analyzer.filter ?? []]
        .flat()
        .map((f) => (typeof f === "string" ? (analysis.filter?.[f] ?? f) : f));
      return { tokenizer, filter };
    };

    const cases = [
      {
        analyzer: "punctuation_analyzer",
        text: "Remainder (%)",
        expected: ["remainder", "%"],
      },
      {
        analyzer: "punctuation_analyzer",
        text: "EventTarget: addEventListener() method",
        expected: ["eventtarget", "addeventlistener", "method"],
      },
      {
        analyzer: "punctuation_analyzer",
        text: "<a>: The Anchor element",
        expected: ["<a>", "the", "anchor", "element"],
      },
      {
        analyzer: "punctuation_analyzer",
        text: "using a hash # prefix",
        expected: ["using", "a", "hash", "#", "prefix"],
      },
      {
        analyzer: "punctuation_analyzer",
        text: ":has()",
        expected: [":has"],
      },
      {
        analyzer: "joined_analyzer",
        text: "Web Workers API",
        expected: ["webworkers", "workersapi"],
      },
    ];
    for (const { analyzer, text, expected } of cases) {
      await t.test(`${analyzer}: ${text}`, async () => {
        const { tokens = [] } = await client.indices.analyze({
          ...inline(analyzer),
          text,
        });
        assert.deepEqual(
          tokens.map(({ token }) => token),
          expected
        );
      });
    }
  }
);

test(
  "inline code relevance ranks exact syntax and partial identifiers above body-only matches",
  {
    skip:
      !searchTestUrl &&
      "set SEARCH_TEST_ELASTICSEARCH_URL to run Elasticsearch relevance tests",
  },
  async (t) => {
    if (!searchTestUrl) {
      return;
    }
    const { Client } = await import("@elastic/elasticsearch");
    const client = new Client({ node: searchTestUrl });
    const index = `dex_inline_code_test_${Date.now()}`;
    await client.indices.create({ index, settings, mappings });
    t.after(async () => {
      await client.indices.delete({ index, ignore_unavailable: true });
      await client.close();
    });

    const documents = [
      {
        _id: "map-code",
        inline_code: ["Array.prototype.map()"],
        body: "Use Array.prototype.map() to transform values.",
      },
      {
        _id: "partial-map-code",
        inline_code: ["Array.prototype.mapper()"],
        body: "Array.prototype.mapper() is an example identifier.",
      },
      {
        _id: "no-store-code",
        inline_code: ["no-store"],
        body: "The Cache-Control directive is no-store.",
      },
      {
        _id: "before-code",
        inline_code: ["::before"],
        body: "The ::before pseudo-element inserts generated content.",
      },
      {
        _id: "body-only",
        inline_code: [],
        body: "Array.prototype.map() no-store ::before are mentioned in prose.",
      },
      (() => {
        const example = htmlToSearchFields(
          "<p>Example output</p><pre><code>Array.prototype.map()</code></pre>"
        );
        return {
          _id: "example-only",
          inline_code: example.inlineCode,
          body: example.body,
        };
      })(),
    ];
    await client.helpers.bulk({
      datasource: documents,
      onDocument(document) {
        const _id = document._id;
        // @ts-expect-error: the test fixture removes its bulk metadata
        delete document._id;
        return { index: { _index: index, _id } };
      },
    });
    await client.indices.refresh({ index });

    const cases = [
      {
        name: "JavaScript method syntax",
        query: "array.prototype.map()",
        expected: "map-code",
      },
      {
        name: "hyphenated directive",
        query: "no-store",
        expected: "no-store-code",
      },
      { name: "CSS punctuation", query: "::before", expected: "before-code" },
      { name: "identifier prefix", query: "prot", expected: "map-code" },
      { name: "method identifier", query: "map", expected: "map-code" },
    ];
    for (const { name, query: searchText, expected } of cases) {
      const response = await client.search({
        index,
        query: {
          bool: {
            should: [
              {
                term: { "inline_code.exact": { value: searchText, boost: 20 } },
              },
              {
                match: {
                  "inline_code.partial": { query: searchText, boost: 5 },
                },
              },
              { match: { body: { query: searchText, boost: 1 } } },
            ],
          },
        },
      });
      const ids = response.hits.hits.map((hit) => hit._id);
      assert.equal(
        ids[0],
        expected,
        `${name}: expected the inline code page first`
      );
      if (searchText === "array.prototype.map()") {
        assert.ok(
          ids.indexOf("map-code") < ids.indexOf("partial-map-code"),
          "an exact code value ranks above a partial identifier match"
        );
      }
      if (searchText !== "prot") {
        assert.ok(
          ids.includes("body-only"),
          `${name}: ordinary prose remains searchable`
        );
      }
      if (searchText === "map") {
        assert.ok(
          ids.includes("example-only"),
          "preformatted examples remain searchable through body text"
        );
        assert.ok(
          ids.indexOf("map-code") < ids.indexOf("example-only"),
          "inline code ranks above a page that mentions the identifier only in an example"
        );
      }
    }
  }
);
