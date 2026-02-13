import { createRequire } from "node:module";

import { REDIRECTS_FILE } from "./env.js";

const require = createRequire(import.meta.url);

/** @type {Record<string, string>} */
export const REDIRECTS = require(REDIRECTS_FILE);
