import { afterEach, describe, it, mock } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createResponse } from "node-mocks-http";

import { createMemoryDiagnostics } from "./memory-diagnostics.js";

/**
 * @typedef {ReturnType<typeof process.memoryUsage> & {
 * instanceId: string, message: string, requestCount: number,
 * completedRequests: number, abortedRequests: number, activeRequests: number
 * }} MemorySample
 */

describe("memory diagnostics", () => {
  afterEach(() => mock.reset());

  it("samples once per minute with stable instance identity and request counts", () => {
    let now = 0;
    mock.method(Date, "now", () => now);
    /** @type {MemorySample[]} */
    const logs = [];
    const diagnose = createMemoryDiagnostics({
      log: (message) => logs.push(JSON.parse(message)),
    });
    const first = createResponse({ eventEmitter: EventEmitter });
    const second = createResponse({ eventEmitter: EventEmitter });

    diagnose(first);
    diagnose(second);
    strictEqual(logs.length, 1);
    const initial = logs[0];
    ok(initial);
    strictEqual(initial.activeRequests, 1);
    first.emit("finish");
    first.emit("close");
    strictEqual(logs.length, 1);
    strictEqual(first.listenerCount("finish"), 0);
    strictEqual(first.listenerCount("close"), 0);

    now = 60000;
    second.emit("close");
    strictEqual(logs.length, 2);
    const sample = logs[1];
    ok(sample);
    strictEqual(sample.instanceId, initial.instanceId);
    strictEqual(sample.message, "cloud-function-memory");
    strictEqual(sample.requestCount, 2);
    strictEqual(sample.completedRequests, 1);
    strictEqual(sample.abortedRequests, 1);
    strictEqual(sample.activeRequests, 0);
    for (const value of [
      sample.rss,
      sample.heapUsed,
      sample.heapTotal,
      sample.external,
      sample.arrayBuffers,
    ]) {
      ok(value >= 0);
    }
    strictEqual(second.listenerCount("finish"), 0);
    strictEqual(second.listenerCount("close"), 0);
  });

  it("counts overlapping requests at the sampling boundary", () => {
    let now = 0;
    mock.method(Date, "now", () => now);
    /** @type {MemorySample[]} */
    const logs = [];
    const diagnose = createMemoryDiagnostics({
      log: (message) => logs.push(JSON.parse(message)),
    });
    const first = createResponse({ eventEmitter: EventEmitter });
    const second = createResponse({ eventEmitter: EventEmitter });
    diagnose(first);
    now = 60000;
    diagnose(second);
    deepStrictEqual(
      logs.map(({ requestCount, activeRequests }) => ({
        requestCount,
        activeRequests,
      })),
      [
        { requestCount: 1, activeRequests: 1 },
        { requestCount: 2, activeRequests: 2 },
      ]
    );
    first.emit("close");
    second.emit("finish");
  });
});
