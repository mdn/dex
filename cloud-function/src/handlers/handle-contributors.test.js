import { after, before, describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

import { startDummyBucket, startHandler } from "../proxy-helpers.js";

const PREFIX = "deploy/";

/**
 * @param {string} mdnUrl
 * @param {string} githubUrl
 * @returns {import("../proxy-helpers.js").BucketFile}
 */
const metadata = (mdnUrl, githubUrl) => ({
  body: JSON.stringify({ mdn_url: mdnUrl, source: { github_url: githubUrl } }),
  contentType: "application/json",
});

/** @type {Record<string, import("../proxy-helpers.js").BucketFile>} */
const BUCKET_FILES = {
  [`${PREFIX}en-us/docs/web/api/blob/metadata.json`]: metadata(
    "/en-US/docs/Web/API/Blob",
    "https://github.com/mdn/content/blob/main/files/en-us/web/api/blob/index.md"
  ),
  [`${PREFIX}en-us/docs/web/css/reference/selectors/_colon_has/metadata.json`]:
    metadata(
      "/en-US/docs/Web/CSS/Reference/Selectors/:has",
      "https://github.com/mdn/content/blob/main/files/en-us/web/css/reference/selectors/_colon_has/index.md"
    ),
  [`${PREFIX}en-us/docs/constructor/metadata.json`]: metadata(
    "/en-US/docs/constructor",
    "https://github.com/mdn/content/blob/main/files/en-us/constructor/index.md"
  ),
  [`${PREFIX}fr/docs/web/html/metadata.json`]: metadata(
    "/fr/docs/Web/HTML",
    "https://github.com/mdn/translated-content/blob/main/files/fr/web/html/index.md"
  ),
  [`${PREFIX}de/docs/web/api/metadata.json`]: metadata(
    "/de/docs/Web/API",
    "https://github.com/mdn/translated-content/blob/main/files/de/web/api/index.md"
  ),
  [`${PREFIX}en-us/docs/invalid/metadata.json`]: {
    body: "not json",
    contentType: "application/json",
  },
  [`${PREFIX}en-us/docs/no-source/metadata.json`]: {
    body: JSON.stringify({ mdn_url: "/en-US/docs/No-source" }),
    contentType: "application/json",
  },
  "other/metadata.json": metadata(
    "/en-US/docs/Evil",
    "https://example.com/blob/evil"
  ),
};

describe("handleContributors", () => {
  /** @type {Awaited<ReturnType<typeof startDummyBucket>>} */
  let bucket;
  /** @type {Awaited<ReturnType<typeof startHandler>>} */
  let handler;

  before(async () => {
    bucket = await startDummyBucket(BUCKET_FILES);
    process.env["WIKIHISTORY_DIR"] = new URL(
      "../fixtures/wikihistory",
      import.meta.url
    ).pathname;
    handler = await startHandler(`${bucket.url}${PREFIX}`);
  });

  after(async () => {
    await handler?.close();
    await bucket?.close();
  });

  const cases = [
    {
      name: "with wiki contributors (only the `/blob/` segment is replaced)",
      path: "/en-US/docs/Web/API/Blob/contributors.txt",
      expected:
        "# Contributors by commit history\nhttps://github.com/mdn/content/commits/main/files/en-us/web/api/blob/index.md\n\n# Original Wiki contributors\nAlice\nBob\n",
    },
    {
      name: "with a path whose case differs from the slug",
      path: "/en-US/docs/web/api/blob/contributors.txt",
      expected:
        "# Contributors by commit history\nhttps://github.com/mdn/content/commits/main/files/en-us/web/api/blob/index.md\n\n# Original Wiki contributors\nAlice\nBob\n",
    },
    {
      name: "without wiki contributors (slug with colon)",
      path: "/en-US/docs/Web/CSS/Reference/Selectors/:has/contributors.txt",
      expected:
        "# Contributors by commit history\nhttps://github.com/mdn/content/commits/main/files/en-us/web/css/reference/selectors/_colon_has/index.md\n\n",
    },
    {
      name: "with a slug matching an `Object.prototype` key",
      path: "/en-US/docs/constructor/contributors.txt",
      expected:
        "# Contributors by commit history\nhttps://github.com/mdn/content/commits/main/files/en-us/constructor/index.md\n\n",
    },
    {
      name: "translated locale with wiki contributors",
      path: "/fr/docs/Web/HTML/contributors.txt",
      expected:
        "# Contributors by commit history\nhttps://github.com/mdn/translated-content/commits/main/files/fr/web/html/index.md\n\n# Original Wiki contributors\nClaire\n",
    },
    {
      name: "locale without wiki history",
      path: "/de/docs/Web/API/contributors.txt",
      expected:
        "# Contributors by commit history\nhttps://github.com/mdn/translated-content/commits/main/files/de/web/api/index.md\n\n",
    },
  ];

  for (const { name, path, expected } of cases) {
    it(`serves ${name}`, async () => {
      const response = await handler.request(path);

      strictEqual(response.status, 200);
      strictEqual(response.text, expected);
      strictEqual(
        response.headers.get("content-type"),
        "text/plain; charset=utf-8"
      );
      strictEqual(response.headers.get("x-robots-tag"), "noindex, nofollow");
      strictEqual(
        response.headers.get("cache-control"),
        "public, max-age=3600"
      );
    });
  }

  it("reads metadata.json instead of contributors.txt from the bucket", async () => {
    bucket.requests.length = 0;
    await handler.request("/en-US/docs/Web/API/Blob/contributors.txt");

    deepStrictEqual(bucket.requests, [
      `${PREFIX}en-us/docs/web/api/blob/metadata.json`,
    ]);
  });

  it("returns 404 for docs that do not exist", async () => {
    const response = await handler.request(
      "/en-US/docs/Web/API/Missing/contributors.txt"
    );

    strictEqual(response.status, 404);
    strictEqual(response.headers.get("cache-control"), "no-store");
    strictEqual(response.headers.get("x-robots-tag"), "noindex, nofollow");
    strictEqual(response.headers.get("x-content-type-options"), "nosniff");
  });

  const errorCases = [
    { name: "invalid JSON", path: "/en-US/docs/Invalid/contributors.txt" },
    {
      name: "a missing `github_url`",
      path: "/en-US/docs/No-source/contributors.txt",
    },
  ];

  for (const { name, path } of errorCases) {
    it(`returns 502 for metadata.json with ${name}`, async () => {
      const response = await handler.request(path);

      strictEqual(response.status, 502);
      strictEqual(response.headers.get("cache-control"), "no-store");
    });
  }

  it("rejects paths the sanitizer turns into dot segments", async () => {
    bucket.requests.length = 0;
    const response = await handler.request(
      "/en-US/docs/.|%2e/.|%2e/.|%2e/other/contributors.txt"
    );

    strictEqual(response.status, 400);
    deepStrictEqual(bucket.requests, []);
  });
});
