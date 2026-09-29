import { createHandler } from "./app.js";
import { http } from "@google-cloud/functions-framework";
import * as Sentry from "@sentry/google-cloud-serverless";

export let mdnHandler = createHandler();

if (process.env["SENTRY_DSN"]) {
  Sentry.init();
  mdnHandler = Sentry.wrapHttpFunction(mdnHandler);
}

http("mdnHandler", mdnHandler);
