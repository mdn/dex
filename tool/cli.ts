#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { whatsdeployed } from "./whatsdeployed.js";

console.warn("\n🗑️  This command is deprecated, and will be removed soon.\n");

yargs(hideBin(process.argv))
  .scriptName("[DEPRECATED] tool")
  .version("0.0.0")
  .command(
    "whatsdeployed [directory]",
    "Create a whatsdeployed.json file by asking git for the date and commit hash of HEAD.",
    (yargs) => {
      return yargs
        .positional("directory", {
          describe: "Path in which to execute git",
          type: "string",
          default: process.cwd(),
        })
        .option("output", {
          describe: "Name of JSON file to create.",
          type: "string",
          default: "whatsdeployed.json",
        })
        .option("dry-run", {
          describe: "Prints the result without writing the file",
          type: "boolean",
          default: false,
        });
    },
    async (argv) => {
      try {
        const { directory, output, dryRun } = argv;
        await whatsdeployed(directory, output, dryRun);
      } catch (e) {
        const error = e as Error;
        if (argv.verbose || (error instanceof Error && !error.message)) {
          console.error(error.stack);
        }
        throw error;
      }
    }
  )
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Run with verbose logging",
  })
  .demandCommand(1, "You need at least one command before moving on")
  .help()
  .alias("help", "h")
  .parse();
