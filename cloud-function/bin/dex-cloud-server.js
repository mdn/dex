#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

// The framework falls back to these when the matching CLI flags are absent.
process.env["FUNCTION_SOURCE"] ??= packageRoot;
process.env["FUNCTION_TARGET"] ??= "mdnHandler";
process.env["IGNORED_ROUTES"] ??= "";

// The CLI entry parses `process.argv` and starts the server on import.
await import(pathToFileURL(frameworkCli).href);
