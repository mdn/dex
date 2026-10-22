import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";

import { PROXY_TIMEOUT } from "../constants.js";
import { upstreamLoggingPlugin } from "../logging.js";

/**
 * Proxy middleware for Mozilla telemetry submissions
 * Forwards telemetry data to Mozilla's telemetry ingestion service
 */
export const proxyTelemetry = createProxyMiddleware({
  target: "https://incoming.telemetry.mozilla.org",
  changeOrigin: true,
  autoRewrite: true,
  proxyTimeout: PROXY_TIMEOUT,
  xfwd: true,
  plugins: [upstreamLoggingPlugin("telemetry")],
  on: {
    proxyReq: fixRequestBody,
  },
});
