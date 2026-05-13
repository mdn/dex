import fs from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import pkg from "./package.json" with { type: "json" };
import { ELASTICSEARCH_URL } from "./constants.js";
import { index } from "./search/index.js";

/**
 * @param {string} value
 * @returns {string}
 */
function validateDirectory(value) {
  if (!value) {
    throw new Error(`${JSON.stringify(value)} is not a valid path`);
  }
  if (!fs.existsSync(value)) {
    throw new Error(`${value} does not exist`);
  }
  if (!fs.statSync(value).isDirectory()) {
    throw new Error(`${value} is not a directory`);
  }
  return value;
}

await yargs(hideBin(process.argv))
  .scriptName("deployer")
  .version(pkg.version)
  .command(
    "search-index <buildroot>",
    "Index built MDN docs into Elasticsearch.",
    (argv) =>
      argv
        .positional("buildroot", {
          type: "string",
          coerce: validateDirectory,
          demandOption: true,
        })
        .option("url", {
          type: "string",
          default: ELASTICSEARCH_URL,
          describe:
            "Elasticsearch URL (if not env var DEPLOYER_ELASTICSEARCH_URL)",
        }),
    async ({ buildroot, url }) => {
      if (!url) {
        console.warn("DEPLOYER_ELASTICSEARCH_URL or --url not set or empty");
        return;
      }
      await index(buildroot, url);
    }
  )
  .demandCommand(1)
  .strict()
  .help()
  .alias("help", "h")
  .parse();
