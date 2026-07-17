/** @import { Request, Response } from "express" */

import { before, describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { getFunction } from "@google-cloud/functions-framework/testing";
import { createRequest, createResponse } from "node-mocks-http";

/** @param {string} name */
const fixture = (name) => new URL(`fixtures/${name}`, import.meta.url).pathname;

describe("mdnHandler", () => {
  /** @type {(req: Request, res: Response) => void} */
  let mdnHandler;

  before(async () => {
    process.env["ENV_FILE"] = "/dev/null";
    process.env["CANONICALS_FILE"] = fixture("canonicals.json");
    process.env["REDIRECTS_FILE"] = fixture("redirects.json");
    await import("./index.js");
    mdnHandler =
      /** @type {(req: Request, res: Response) => void} */
      (getFunction("mdnHandler"));
  });

  it("returns 302 for GET /", async () => {
    const req = createRequest({
      method: "GET",
      url: "/",
      hostname: "localhost",
      headers: { host: "localhost" },
    });
    const res = createResponse();
    mdnHandler(req, res);

    strictEqual(res.statusCode, 302);
  });

  it("returns 302 for HEAD /", async () => {
    const req = createRequest({
      method: "HEAD",
      url: "/",
      hostname: "localhost",
      headers: { host: "localhost" },
    });
    const res = createResponse();
    mdnHandler(req, res);

    strictEqual(res.statusCode, 302);
  });

  it("returns 405 for OPTIONS /", async () => {
    const req = createRequest({
      method: "OPTIONS",
      url: "/",
      hostname: "localhost",
      headers: { host: "localhost" },
    });
    const res = createResponse();
    mdnHandler(req, res);

    strictEqual(res.statusCode, 405);
    strictEqual(res.getHeader("allow"), "GET");
  });

  it("returns 405 for POST /", async () => {
    const req = createRequest({
      method: "POST",
      url: "/",
      hostname: "localhost",
      headers: { host: "localhost" },
    });
    const res = createResponse();
    mdnHandler(req, res);

    strictEqual(res.statusCode, 405);
    strictEqual(res.getHeader("allow"), "GET");
  });

  it("returns 405 for PUT /", async () => {
    const req = createRequest({
      method: "PUT",
      url: "/",
      hostname: "localhost",
      headers: { host: "localhost" },
    });
    const res = createResponse();
    mdnHandler(req, res);

    strictEqual(res.statusCode, 405);
    strictEqual(res.getHeader("allow"), "GET");
  });

  it("returns 405 for DELETE /", async () => {
    const req = createRequest({
      method: "DELETE",
      url: "/",
      hostname: "localhost",
      headers: { host: "localhost" },
    });
    const res = createResponse();
    mdnHandler(req, res);

    strictEqual(res.statusCode, 405);
    strictEqual(res.getHeader("allow"), "GET");
  });

  it("returns 405 for PATCH /", async () => {
    const req = createRequest({
      method: "PATCH",
      url: "/",
      hostname: "localhost",
      headers: { host: "localhost" },
    });
    const res = createResponse();
    mdnHandler(req, res);

    strictEqual(res.statusCode, 405);
    strictEqual(res.getHeader("allow"), "GET");
  });

  describe("preferredlocale cookie", () => {
    it("redirects /en-US/docs/Web to /fr/docs/Web with preferredlocale=fr", async () => {
      const req = createRequest({
        method: "GET",
        url: "/en-US/docs/Web",
        hostname: "localhost",
        headers: { host: "localhost" },
        cookies: { preferredlocale: "fr" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 302);
      strictEqual(res._getRedirectUrl(), "/fr/docs/Web");
    });

    it("redirects /en-US/ to /fr/ with preferredlocale=fr", async () => {
      const req = createRequest({
        method: "GET",
        url: "/en-US/",
        hostname: "localhost",
        headers: { host: "localhost" },
        cookies: { preferredlocale: "fr" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 302);
      strictEqual(res._getRedirectUrl(), "/fr/");
    });

    it("does not redirect /en-US/ without preferredlocale", async () => {
      const req = createRequest({
        method: "GET",
        url: "/en-US/",
        hostname: "localhost",
        headers: { host: "localhost" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 200);
    });

    it("does not redirect /fr/ with preferredlocale=fr (already expected locale)", async () => {
      const req = createRequest({
        method: "GET",
        url: "/fr/",
        hostname: "localhost",
        headers: { host: "localhost" },
        cookies: { preferredlocale: "fr" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 200);
    });

    it("does not redirect /en-US/blog/ with preferredlocale=fr (locale not available)", async () => {
      const req = createRequest({
        method: "GET",
        url: "/en-US/blog/",
        hostname: "localhost",
        headers: { host: "localhost" },
        cookies: { preferredlocale: "fr" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 200);
    });
  });

  describe("missing locale (canonical-aware fallback)", () => {
    it("redirects /about to /en-US/about (issue #279)", async () => {
      const req = createRequest({
        method: "GET",
        url: "/about",
        hostname: "localhost",
        headers: { host: "localhost" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 302);
      strictEqual(res._getRedirectUrl(), "/en-US/about");
    });

    it("redirects /community to /en-US/community", async () => {
      const req = createRequest({
        method: "GET",
        url: "/community",
        hostname: "localhost",
        headers: { host: "localhost" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 302);
      strictEqual(res._getRedirectUrl(), "/en-US/community");
    });

    it("redirects /advertising to /en-US/advertising", async () => {
      const req = createRequest({
        method: "GET",
        url: "/advertising",
        hostname: "localhost",
        headers: { host: "localhost" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 302);
      strictEqual(res._getRedirectUrl(), "/en-US/advertising");
    });

    it("preserves query string when inserting locale", async () => {
      const req = createRequest({
        method: "GET",
        url: "/about?foo=bar",
        hostname: "localhost",
        headers: { host: "localhost" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 302);
      strictEqual(res._getRedirectUrl(), "/en-US/about?foo=bar");
    });

    it("uses Accept-Language to pick best locale when multiple are available", async () => {
      const req = createRequest({
        method: "GET",
        url: "/docs/Web",
        hostname: "localhost",
        headers: { host: "localhost", "accept-language": "fr" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 302);
      strictEqual(res._getRedirectUrl(), "/fr/docs/Web");
    });

    it("falls back to en-US when preferredlocale has no translation", async () => {
      const req = createRequest({
        method: "GET",
        url: "/about",
        hostname: "localhost",
        headers: { host: "localhost" },
        cookies: { preferredlocale: "de" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 302);
      strictEqual(res._getRedirectUrl(), "/en-US/about");
    });
  });

  describe("locale fallback to en-US", () => {
    it("redirects /de/about to /en-US/about when de translation is missing", async () => {
      const req = createRequest({
        method: "GET",
        url: "/de/about",
        hostname: "localhost",
        headers: { host: "localhost" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 302);
      strictEqual(res._getRedirectUrl(), "/en-US/about");
    });

    it("does not fall back from en-US to itself for missing pages", async () => {
      const req = createRequest({
        method: "GET",
        url: "/en-US/non-existent-page",
        hostname: "localhost",
        headers: { host: "localhost" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 200);
    });

    it("does not redirect when neither current locale nor en-US has the page", async () => {
      const req = createRequest({
        method: "GET",
        url: "/de/non-existent-page",
        hostname: "localhost",
        headers: { host: "localhost" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 200);
    });
  });

  describe("unsupported locale recovery", () => {
    it("redirects /xy/about to /en-US/about (treats xy as bogus locale)", async () => {
      const req = createRequest({
        method: "GET",
        url: "/xy/about",
        hostname: "localhost",
        headers: { host: "localhost" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 302);
      strictEqual(res._getRedirectUrl(), "/en-US/about");
    });

    it("does not redirect /xy/non-existent (no canonical match in either form)", async () => {
      const req = createRequest({
        method: "GET",
        url: "/xy/non-existent",
        hostname: "localhost",
        headers: { host: "localhost" },
      });
      const res = createResponse();
      mdnHandler(req, res);

      strictEqual(res.statusCode, 200);
    });
  });
});
