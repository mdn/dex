import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import {
  errorOutcome,
  fetchUpstream,
  requestContext,
  routeCategory,
  startUpstream,
} from "./logging.js";
import { startHandler } from "./proxy-helpers.js";

/** @type {import("node:test").Mock<typeof console.log>} */
let logMock;

/** @returns {{ severity: string, event: string, context: Record<string, unknown> }[]} */
const records = () =>
  logMock.mock.calls.map((call) => JSON.parse(String(call.arguments[0])));

beforeEach(() => {
  logMock = mock.method(console, "log", () => {});
});
afterEach(() => mock.restoreAll());

describe("routeCategory", () => {
  const cases = [
    { name: "docs page", url: "/en-US/docs/Web/API", expected: "docs" },
    {
      name: "docs sidecar file",
      url: "/en-US/docs/Web/API/metadata.json",
      expected: "docs",
    },
    {
      name: "attachment under docs",
      url: "/en-US/docs/Web/foo.png",
      expected: "attachment",
    },
    { name: "font", url: "/en-US/fonts/a.woff2", expected: "attachment" },
    {
      name: "static asset keeps precedence",
      url: "/assets/logo.png",
      expected: "static_asset",
    },
    { name: "blog", url: "/en-US/blog/post/", expected: "blog" },
    { name: "api", url: "/api/v1/whoami", expected: "api" },
    { name: "advertising", url: "/pong/get", expected: "advertising" },
    {
      name: "query is ignored",
      url: "/en-US/docs/Web?a=b.png",
      expected: "docs",
    },
    { name: "unknown path", url: "/foo", expected: "other" },
  ];
  for (const { name, url, expected } of cases) {
    it(name, () => strictEqual(routeCategory(url), expected));
  }
});

describe("requestContext", () => {
  it("adds format for index.json", () => {
    deepStrictEqual(requestContext("/en-US/docs/Web/index.json"), {
      route: "docs",
      format: "index_json",
    });
  });
  it("omits format otherwise", () => {
    deepStrictEqual(requestContext("/en-US/docs/Web"), {
      route: "docs",
      format: undefined,
    });
  });
});

describe("errorOutcome", () => {
  const cases = [
    { name: "plain error", error: new Error("x"), expected: "error" },
    { name: "non-object", error: "x", expected: "error" },
    {
      name: "AbortError",
      error: new DOMException("x", "AbortError"),
      expected: "aborted",
    },
    {
      name: "TimeoutError",
      error: new DOMException("x", "TimeoutError"),
      expected: "timeout",
    },
    {
      name: "timeout code",
      error: Object.assign(new Error("x"), { code: "ETIMEDOUT" }),
      expected: "timeout",
    },
    {
      name: "nested cause",
      error: new Error("x", { cause: { code: "UND_ERR_BODY_TIMEOUT" } }),
      expected: "timeout",
    },
  ];
  for (const { name, error, expected } of cases) {
    it(name, () => strictEqual(errorOutcome(error), expected));
  }
});

describe("startUpstream", () => {
  const cases = [
    { name: "success", outcome: "success", status: 200, severity: "INFO" },
    { name: "404", outcome: "http_error", status: 404, severity: "INFO" },
    { name: "500", outcome: "http_error", status: 500, severity: "WARNING" },
    {
      name: "timeout",
      outcome: "timeout",
      status: undefined,
      severity: "WARNING",
    },
  ];
  for (const { name, outcome, status, severity } of cases) {
    it(`logs ${name} as ${severity}`, () => {
      startUpstream({ source: "s" })(/** @type {any} */ (outcome), status);
      const [record] = records();
      strictEqual(record?.severity, severity);
      strictEqual(record?.context["outcome"], outcome);
    });
  }

  it("logs only the first outcome", () => {
    const complete = startUpstream({});
    complete("success", 200);
    complete("aborted");
    strictEqual(records().length, 1);
  });
});

describe("fetchUpstream", () => {
  const server = createServer((req, res) => {
    if (req.url === "/missing") {
      res.statusCode = 404;
    }
    res.end("body");
  });
  /** @type {string} */
  let base;
  before(async () => {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
  });
  after(() => server.close());

  it("logs success after consuming the body", async () => {
    const text = await fetchUpstream(`${base}/ok`, { source: "t" }, (r) =>
      r.text()
    );
    strictEqual(text, "body");
    deepStrictEqual(
      records().map((r) => [
        r.event,
        r.context["outcome"],
        r.context["status"],
      ]),
      [["upstream_request", "success", 200]]
    );
  });

  it("logs a 404 as http_error at INFO", async () => {
    await fetchUpstream(`${base}/missing`, { source: "t" }, async () => {});
    const [record] = records();
    strictEqual(record?.severity, "INFO");
    strictEqual(record?.context["outcome"], "http_error");
  });

  it("drains an unread body and rethrows consume errors", async () => {
    await rejects(
      fetchUpstream(`${base}/ok`, { source: "t" }, async () => {
        throw new Error("boom");
      }),
      /boom/
    );
    strictEqual(records().length, 1);
    strictEqual(records()[0]?.context["outcome"], "error");
  });

  it("logs a connection failure as error", async () => {
    await rejects(
      fetchUpstream("http://127.0.0.1:1/", { source: "t" }, async () => {})
    );
    strictEqual(records()[0]?.context["outcome"], "error");
  });
});

describe("proxy logging", () => {
  const upstream = createServer((req, res) => {
    if (req.url?.includes("/truncated/")) {
      res.writeHead(200, {
        "content-type": "text/html",
        "content-length": 1000,
      });
      res.write("partial");
      setTimeout(() => res.socket?.destroy(), 20);
      return;
    }
    if (req.url?.endsWith("/404/index.html")) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("404 page");
      return;
    }
    res.statusCode = req.url?.includes("/missing/") ? 404 : 200;
    res.end("page");
  });
  /** @type {import("./proxy-helpers.js").Handler} */
  let handler;
  before(async () => {
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    const { port } = /** @type {any} */ (upstream.address());
    handler = await startHandler(`http://127.0.0.1:${port}/`);
  });
  after(async () => {
    await handler.close();
    upstream.close();
  });

  /** @param {string} path */
  const proxied = async (path) => {
    await handler.request(path);
    await sleep(100);
    return records();
  };

  it("logs an expected 404 at INFO only", async () => {
    const all = await proxied("/en-US/docs/Missing");
    strictEqual(all.filter((r) => r.severity !== "INFO").length, 0);
    strictEqual(
      all.some((r) => r.context["status"] === 404),
      true
    );
  });

  it("logs no client abort when the upstream fails", async () => {
    const all = await proxied("/en-US/docs/Truncated");
    strictEqual(all.filter((r) => r.event === "request_aborted").length, 0);
    strictEqual(
      all.filter(
        (r) =>
          r.event === "upstream_request" && r.context["outcome"] === "aborted"
      ).length,
      1
    );
  });
});
