import { test } from "node:test";
import assert from "node:assert/strict";

import { htmlStrip } from "./index.js";

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
