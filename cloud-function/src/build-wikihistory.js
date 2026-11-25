import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { VALID_LOCALES } from "./internal/constants/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.join(dirname, "..", "..");
dotenv.config({
  path: path.join(root, process.env["ENV_FILE"] || ".env"),
  quiet: true,
});

function buildWikiHistory() {
  const output =
    process.env["WIKIHISTORY_DIR"] || path.join(dirname, "..", "wikihistory");
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });

  ["CONTENT_ROOT", "CONTENT_TRANSLATED_ROOT"].forEach((envvar) => {
    if (!process.env[envvar]) {
      console.error(`Missing ENV variable: ${envvar}`);
      return;
    }

    const base = process.env[envvar];
    console.log(`${envvar} = ${base}`);

    for (const locale of VALID_LOCALES.keys()) {
      const file = [
        // Absolute path.
        `${base}/${locale}/_wikihistory.json`,
        `${base}/files/${locale}/_wikihistory.json`,
        // Relative path.
        `${root}/${base}/${locale}/_wikihistory.json`,
        `${root}/${base}/files/${locale}/_wikihistory.json`,
      ].find((file) => fs.existsSync(file));

      if (!file) {
        continue;
      }

      /** @type {Record<string, { contributors?: string[] }>} */
      const history = JSON.parse(fs.readFileSync(file, "utf-8"));
      /** @type {Record<string, string[]>} */
      const contributors = {};
      for (const [slug, entry] of Object.entries(history)) {
        if (entry.contributors?.length) {
          contributors[slug] = entry.contributors;
        }
      }

      const target = path.join(output, `${locale}.json`);
      fs.writeFileSync(target, JSON.stringify(contributors));

      const count = Object.keys(contributors).length;
      const kb = Math.round(fs.statSync(target).size / 1024);
      console.log(`- ${file}: ${count} docs in ${kb} KB`);
    }
  });

  if (!fs.existsSync(path.join(output, "en-us.json"))) {
    console.error("Missing en-us wiki history.");
    process.exitCode = 1;
  }
}

buildWikiHistory();
