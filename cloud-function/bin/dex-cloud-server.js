#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const frameworkEntry = require.resolve("@google-cloud/functions-framework");
const frameworkRoot = path.resolve(path.dirname(frameworkEntry), "../..");
const frameworkPackage = JSON.parse(
  readFileSync(path.join(frameworkRoot, "package.json"), "utf8")
);
const frameworkCli = path.join(
  frameworkRoot,
  frameworkPackage.bin["functions-framework"]
);
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const child = spawn(
  process.execPath,
  [
    frameworkCli,
    `--source=${packageRoot}`,
    "--target=mdnHandler",
    "--ignored-routes=",
  ],
  { env: process.env, stdio: "inherit" }
);

/** @type {NodeJS.Signals[]} */
const signals = ["SIGINT", "SIGTERM"];
for (const signal of signals) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
