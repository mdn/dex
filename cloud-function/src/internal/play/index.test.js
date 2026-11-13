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
  const body = output.slice(output.indexOf("<body>"));
  const head = output.slice(0, output.indexOf("</head>"));

  const cases = [
    {
      name: "closes unclosed tags, attribute values, and comments",
      haystack: body,
      needle: `<!-- "" '' -->`,
    },
    {
      name: "records that the runner script was reached",
      haystack: body,
      needle: "window.__mdnPlayJsStarted = true;",
    },
    {
      name: "records that the runner script ended",
      haystack: body,
      needle: "window.__mdnPlayJsEnded = true;",
    },
    {
      name: "checks the flags from the head",
      haystack: head,
      needle: "window.__mdnPlayJsStarted && window.__mdnPlayJsEnded",
    },
    {
      name: "checks the flags after DOMContentLoaded",
      haystack: head,
      needle: 'addEventListener("DOMContentLoaded"',
    },
  ];

  for (const { name, haystack, needle } of cases) {
    it(name, () => {
      assert.ok(haystack.includes(needle), `missing ${needle}`);
    });
  }

  it("places the closer and flag script between the HTML and the runner", () => {
    const html = body.indexOf("<p>ok</p>");
    const closer = body.indexOf(`<!-- "" '' -->`);
    const started = body.indexOf("__mdnPlayJsStarted = true");
    const runner = body.indexOf('id="mdn-play-js"');
    const ended = body.indexOf("__mdnPlayJsEnded = true");
    assert.ok(html < closer && closer < started && started < runner);
    assert.ok(runner < ended);
  });
});

describe("renderHtml tabbed interactive example color scheme", () => {
  /** @type {{ theme: "light" | "dark", expectedColorScheme: string, expectedBackground: string, expectedColor: string }[]} */
  const cases = [
    {
      theme: "light",
      expectedColorScheme: "color-scheme: light",
      expectedBackground: "--background-primary: #fff",
      expectedColor: "color: #15141aff",
    },
    {
      theme: "dark",
      expectedColorScheme: "color-scheme: dark",
      expectedBackground: "--background-primary: #1b1b1b",
      expectedColor: "color: #fff",
    },
  ];

  for (const {
    theme,
    expectedColorScheme,
    expectedBackground,
    expectedColor,
  } of cases) {
    it(`uses the ${theme} theme for the example defaults`, () => {
      const html = renderHtml({
        html: "<p>ok</p>",
        css: "",
        js: "",
        defaults: "ix-tabbed",
        theme,
      });

      assert.ok(html.includes(expectedColorScheme));
      assert.ok(html.includes(expectedBackground));
      assert.ok(
        html.includes("background-color: var(--background-primary, #fff)")
      );
      assert.ok(html.includes(expectedColor));
    });
  }
});
