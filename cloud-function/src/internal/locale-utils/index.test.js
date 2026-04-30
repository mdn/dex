/** @import { Request } from "express" */

import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";

import { getLocale, isValidLocale } from "./index.js";

/**
 * @param {{ acceptLanguage?: string, cookie?: string }} [headers]
 * @returns {Request}
 */
function makeRequest({ acceptLanguage, cookie } = {}) {
  /** @type {Record<string, string>} */
  const headers = {};
  if (acceptLanguage !== undefined) {
    headers["accept-language"] = acceptLanguage;
  }
  if (cookie !== undefined) {
    headers["cookie"] = cookie;
  }
  return /** @type {Request} */ (/** @type {unknown} */ ({ headers }));
}

describe("getLocale", () => {
  describe("Accept-Language", () => {
    it("returns the exact regional match for zh-TW", () => {
      strictEqual(
        getLocale(makeRequest({ acceptLanguage: "zh-TW" }), {}),
        "zh-TW"
      );
    });

    it("returns the exact regional match for zh-CN", () => {
      strictEqual(
        getLocale(makeRequest({ acceptLanguage: "zh-CN" }), {}),
        "zh-CN"
      );
    });

    it("returns the exact regional match for pt-BR", () => {
      strictEqual(
        getLocale(makeRequest({ acceptLanguage: "pt-BR" }), {}),
        "pt-BR"
      );
    });

    it("matches a bare language code to a supported region (en -> en-US)", () => {
      strictEqual(
        getLocale(makeRequest({ acceptLanguage: "en" }), {}),
        "en-US"
      );
    });

    it("matches a bare language code to a supported region (pt -> pt-BR)", () => {
      strictEqual(
        getLocale(makeRequest({ acceptLanguage: "pt" }), {}),
        "pt-BR"
      );
    });

    it("falls back loosely when the region is unsupported (en-GB -> en-US)", () => {
      strictEqual(
        getLocale(makeRequest({ acceptLanguage: "en-GB" }), {}),
        "en-US"
      );
    });

    it("falls back loosely when the region is unsupported (pt-PT -> pt-BR)", () => {
      strictEqual(
        getLocale(makeRequest({ acceptLanguage: "pt-PT" }), {}),
        "pt-BR"
      );
    });

    it("respects quality values to pick zh-TW over zh-CN", () => {
      strictEqual(
        getLocale(
          makeRequest({ acceptLanguage: "zh-CN;q=0.5,zh-TW;q=0.9" }),
          {}
        ),
        "zh-TW"
      );
    });

    it("returns the configured fallback when no header is present", () => {
      strictEqual(getLocale(makeRequest(), { fallback: "fr" }), "fr");
    });

    it("returns en-US when no header is present and no fallback is given", () => {
      strictEqual(getLocale(makeRequest(), {}), "en-US");
    });

    it("returns the configured fallback when no language is supported", () => {
      strictEqual(
        getLocale(makeRequest({ acceptLanguage: "xx-YY" }), {
          fallback: "fr",
        }),
        "fr"
      );
    });
  });

  describe("preferredlocale cookie", () => {
    it("returns the cookie locale when valid", () => {
      strictEqual(
        getLocale(makeRequest({ cookie: "preferredlocale=zh-TW" }), {}),
        "zh-TW"
      );
    });

    it("normalises cookie casing to the canonical form", () => {
      strictEqual(
        getLocale(makeRequest({ cookie: "preferredlocale=zh-tw" }), {}),
        "zh-TW"
      );
    });

    it("prefers the cookie over Accept-Language", () => {
      strictEqual(
        getLocale(
          makeRequest({
            acceptLanguage: "en-US",
            cookie: "preferredlocale=zh-TW",
          }),
          {}
        ),
        "zh-TW"
      );
    });

    it("falls back to Accept-Language when the cookie is invalid", () => {
      strictEqual(
        getLocale(
          makeRequest({
            acceptLanguage: "fr",
            cookie: "preferredlocale=xx-YY",
          }),
          {}
        ),
        "fr"
      );
    });
  });
});

describe("isValidLocale", () => {
  it("accepts a canonical locale", () => {
    strictEqual(isValidLocale("zh-TW"), true);
  });

  it("accepts a lowercase locale", () => {
    strictEqual(isValidLocale("zh-tw"), true);
  });

  it("rejects a retired locale", () => {
    strictEqual(isValidLocale("it"), false);
  });

  it("rejects a non-string", () => {
    strictEqual(isValidLocale(null), false);
    strictEqual(isValidLocale(42), false);
  });
});
