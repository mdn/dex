import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";

import { Source, sourceUri } from "../env.js";
import { PROXY_TIMEOUT } from "../constants.js";
import { upstreamLoggingPlugin } from "../logging.js";

/**
 * Proxy middleware for API requests
 * Forwards requests to the backend API server
 */
export const proxyApi = createProxyMiddleware({
  target: sourceUri(Source.api),
  changeOrigin: true,
  autoRewrite: true,
  proxyTimeout: PROXY_TIMEOUT,
  xfwd: true,
  plugins: [upstreamLoggingPlugin("api")],
  on: {
    proxyReq: fixRequestBody,
  },
});
