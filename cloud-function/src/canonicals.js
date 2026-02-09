import { createRequire } from "node:module";

import { CANONICALS_FILE } from "./env.js";

const require = createRequire(import.meta.url);

export const CANONICALS = require(CANONICALS_FILE);
