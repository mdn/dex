/** @import { Request } from "express" */

import * as path from "node:path";
import { cwd } from "node:process";

import dotenv from "dotenv";

dotenv.config({
  path: path.join(cwd(), process.env["ENV_FILE"] || ".env"),
  quiet: true,
});

export const LOCAL_CONTENT = "http://localhost:8100/";
export const LOCAL_RUMBA = "http://localhost:8000/";

/**
 * @typedef {"main" | "liveSamples" | "play" | "unsafe"} OriginType
 */

/**
 * @typedef {"content" | "liveSamples" | "rumba" | "sharedAssets"} SourceType
 */

/** @type {{main: "main", liveSamples: "liveSamples", play: "play", unsafe: "unsafe"}} */
export const Origin = Object.freeze({
  main: "main",
  liveSamples: "liveSamples",
  play: "play",
  unsafe: "unsafe",
});

/** @type {{content: "content", liveSamples: "liveSamples", api: "rumba", sharedAssets: "sharedAssets"}} */
export const Source = Object.freeze({
  content: "content",
  liveSamples: "liveSamples",
  api: "rumba",
  sharedAssets: "sharedAssets",
});

export const ORIGIN_MAIN = process.env["ORIGIN_MAIN"] || "localhost";
export const ORIGIN_LIVE_SAMPLES =
  process.env["ORIGIN_LIVE_SAMPLES"] || "localhost";
export const ORIGIN_PLAY = process.env["ORIGIN_PLAY"] || "localhost";

export const SOURCE_CONTENT = process.env["SOURCE_CONTENT"] || LOCAL_CONTENT;
export const SOURCE_API =
  process.env["SOURCE_API"] || "https://developer.allizom.org/";
export const SOURCE_SHARED_ASSETS =
  process.env["SOURCE_SHARED_ASSETS"] || "https://mdn.github.io/shared-assets/";

/**
 * Determine the origin type from a request
 * @param {Request} req - Express request object
 * @returns {OriginType} The origin type
 */
export function getOriginFromRequest(req) {
  if (
    req.hostname === ORIGIN_MAIN &&
    !req.path.includes("/_sample_.") &&
    !req.path.endsWith("/runner.html")
  ) {
    return Origin.main;
  } else if (
    req.hostname === ORIGIN_LIVE_SAMPLES &&
    !req.path.endsWith("/runner.html")
  ) {
    return Origin.liveSamples;
  } else if (req.hostname.endsWith(ORIGIN_PLAY)) {
    return Origin.play;
  } else {
    return Origin.unsafe;
  }
}

/**
 * Get the URI for a given source
 * @param {SourceType} source - Source type
 * @returns {string} Source URI
 */
export function sourceUri(source) {
  switch (source) {
    case Source.content:
      return SOURCE_CONTENT;
    case Source.api:
      return SOURCE_API;
    case Source.sharedAssets:
      return SOURCE_SHARED_ASSETS;
    default:
      return "";
  }
}

// Placements.
export const SIGN_SECRET = process.env["SIGN_SECRET"] ?? "";
export const BSA_ZONE_KEYS = Object.fromEntries(
  (process.env["BSA_ZONE_KEYS"] ?? "").split(";").map((k) => k.split(":"))
);

export const WILDCARD_ENABLED = Boolean(
  JSON.parse(process.env["WILDCARD_ENABLED"] || "false")
);

// HTTPS.
// (Use https://github.com/FiloSottile/mkcert to generate a locally-trusted certificate.)
export const HTTPS_KEY_FILE = process.env["HTTPS_KEY_FILE"] ?? "";
export const HTTPS_CERT_FILE = process.env["HTTPS_CERT_FILE"] ?? "";
