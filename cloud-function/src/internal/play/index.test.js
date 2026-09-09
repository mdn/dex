import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderHtml } from "./index.js";

describe("renderHtml", () => {
  const output = renderHtml();

  it("reads the uuid from the runner URL", () => {
    assert.match(
      output,
      /new URLSearchParams\(location\.search\)\.get\("uuid"\) \|\| undefined/
    );
  });

  const cases = [
    { name: "ready", pattern: /postMessage\(\{ uuid, typ: "ready" \}, "\*"\)/ },
    { name: "console", pattern: /\{ uuid, typ: "console", prop, args \}/ },
    {
      name: "console fallback",
      pattern: /\{\s+uuid,\s+typ: "console",\s+prop,\s+args: args\.map/,
    },
    {
      name: "console warn",
      pattern: /\{\s+uuid,\s+typ: "console",\s+prop: "warn",/,
    },
  ];

  for (const { name, pattern } of cases) {
    it(`tags the ${name} message with the uuid`, () => {
      assert.match(output, pattern);
    });
  }
});

describe("renderHtml swallow detection", () => {
  const output = renderHtml({ html: "<p>ok</p>", css: "", js: "1;" });
  const head = output.slice(0, output.indexOf("</head>"));

  const cases = [
    {
      name: "marks the runner script",
      haystack: output,
      needle: 'id="mdn-play-js"',
    },
    {
      name: "marks the end of the runner script",
      haystack: output,
      needle: 'id="mdn-play-js-end"',
    },
    {
      name: "runs from the head",
      haystack: head,
      needle: 'querySelector("script#mdn-play-js")',
    },
    {
      name: "runs after DOMContentLoaded",
      haystack: head,
      needle: 'addEventListener("DOMContentLoaded"',
    },
  ];

  for (const { name, haystack, needle } of cases) {
    it(name, () => {
      assert.ok(haystack.includes(needle), `missing ${needle}`);
    });
  }
});
