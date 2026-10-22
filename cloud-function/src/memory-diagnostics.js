/** @import { ServerResponse } from "node:http" */

import { randomUUID } from "node:crypto";

/**
 * @param {{ log?: (message: string) => void }} [options]
 * @returns {(res: ServerResponse) => void}
 */
export function createMemoryDiagnostics({ log = console.log } = {}) {
  const instanceId = randomUUID();
  /** @type {number | undefined} */
  let lastSample;
  let requestCount = 0;
  let completedRequests = 0;
  let abortedRequests = 0;
  let activeRequests = 0;

  function sample() {
    const now = Date.now();
    if (lastSample !== undefined && now - lastSample < 60000) {
      return;
    }
    lastSample = now;
    log(
      JSON.stringify({
        severity: "INFO",
        message: "cloud-function-memory",
        instanceId,
        pid: process.pid,
        uptimeSeconds: process.uptime(),
        requestCount,
        completedRequests,
        abortedRequests,
        activeRequests,
        ...process.memoryUsage(),
      })
    );
  }

  return (res) => {
    requestCount++;
    activeRequests++;
    sample();
    let settled = false;

    /** @param {boolean} completed */
    function settle(completed) {
      if (settled) {
        return;
      }
      settled = true;
      activeRequests--;
      if (completed) {
        completedRequests++;
      } else {
        abortedRequests++;
      }
      res.removeListener("finish", finish);
      res.removeListener("close", close);
      sample();
    }

    function finish() {
      settle(true);
    }

    function close() {
      settle(false);
    }

    res.once("finish", finish);
    res.once("close", close);
  };
}
