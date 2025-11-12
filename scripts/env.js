import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";

const dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = path.join(dirname, "..", "..");

export const BUILD_OUT_ROOT =
  process.env.BUILD_OUT_ROOT || path.join(ROOT, "client", "build");

export const OPENAI_KEY = process.env.OPENAI_KEY || "";
export const PG_URI = process.env.PG_URI || "";
