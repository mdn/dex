import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("build-wikihistory.js", import.meta.url).pathname;

/**
 * @param {Record<string, Record<string, unknown>>} histories - keyed by locale folder
 */
function run(histories) {
  const dir = mkdtempSync(join(tmpdir(), "build-wikihistory-"));
  const content = join(dir, "content");
  for (const [locale, history] of Object.entries(histories)) {
    mkdirSync(join(content, locale), { recursive: true });
    writeFileSync(
      join(content, locale, "_wikihistory.json"),
      JSON.stringify(history)
    );
  }
  const output = join(dir, "out");
  const { status } = spawnSync(process.execPath, [script], {
    env: {
      ENV_FILE: "none",
      CONTENT_ROOT: content,
      CONTENT_TRANSLATED_ROOT: content,
      WIKIHISTORY_DIR: output,
    },
  });
  return { status, output };
}

describe("build-wikihistory", () => {
  it("keeps only docs with wiki contributors", () => {
    const { status, output } = run({
      "en-us": {
        "Web/API": { modified: "2020-01-01", contributors: ["Alice"] },
        "Web/CSS": { modified: "2020-01-01", contributors: [] },
        "Web/HTML": { modified: "2020-01-01" },
      },
    });

    strictEqual(status, 0);
    deepStrictEqual(readdirSync(output), ["en-us.json"]);
    deepStrictEqual(
      JSON.parse(readFileSync(join(output, "en-us.json"), "utf-8")),
      { "Web/API": ["Alice"] }
    );
  });

  it("fails without en-us wiki history", () => {
    const { status } = run({ fr: { "Web/API": { contributors: ["Alice"] } } });

    strictEqual(status, 1);
  });
});
