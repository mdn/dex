#!/usr/bin/env node

import caporal from "@caporal/core";

import { Action, ActionParameters } from "types";

import { whatsdeployed } from "./whatsdeployed.js";

const { program } = caporal;

interface WhatsdeployedActionParameters extends ActionParameters {
  args: {
    directory: string;
  };
  options: {
    output: string;
    dryRun: boolean;
  };
}

function tryOrExit<T extends ActionParameters>(
  f: ({ options, ...args }: T) => unknown
): Action {
  return async ({ options = {}, ...args }: ActionParameters) => {
    try {
      await f({ options, ...args } as T);
    } catch (e) {
      const error = e as Error;
      if (
        options.verbose ||
        options.v ||
        (error instanceof Error && !error.message)
      ) {
        console.error(error.stack);
      }
      throw error;
    }
  };
}

program
  .name("[DEPRECATED] tool")
  .version("0.0.0")
  .disableGlobalOption("--silent")
  .cast(false)

  .command(
    "whatsdeployed",
    "Create a whatsdeployed.json file by asking git for the date and commit hash of HEAD."
  )
  .argument("<directory>", "Path in which to execute git", {
    default: process.cwd(),
  })
  .option("--output <output>", "Name of JSON file to create.", {
    default: "whatsdeployed.json",
  })
  .option("--dry-run", "Prints the result without writing the file")
  .action(
    tryOrExit(async ({ args, options }: WhatsdeployedActionParameters) => {
      const { directory } = args;
      const { output, dryRun } = options;
      return whatsdeployed(directory, output, dryRun);
    })
  );

console.warn("\n🗑️  This command is deprecated, and will be removed soon.\n");

program.run();
