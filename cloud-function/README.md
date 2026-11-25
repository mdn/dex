# `@mdn/dex-cloud-server`

MDN's HTTP request handler, packaged for standalone use or deployment through
Google Cloud Functions.

## Install

```sh
npm install @mdn/dex-cloud-server
```

## Start the server

The published package does not include `canonicals.json` or `redirects.json`.
Provide those files separately and set both paths before starting the server:

```sh
CANONICALS_FILE=/absolute/path/to/canonicals.json \
REDIRECTS_FILE=/absolute/path/to/redirects.json \
npx dex-cloud-server
```

The server listens on `PORT`, which defaults to `8080`. It also loads a `.env`
file from the current working directory. `ENV_FILE` can specify a different
path.

The handler factory is available for applications that need to mount the handler
themselves:

```js
import { createHandler } from "@mdn/dex-cloud-server";

const handler = createHandler();
```

## Deploy to Google Cloud Functions

The package keeps `src/index.js` as its main entry point and registers the
`mdnHandler` HTTP function. When deploying from a Dex checkout, the deployment
workflow generates `canonicals.json` and `redirects.json` at their default
paths. When deploying an installed npm package, provide the files separately and
set `CANONICALS_FILE` and `REDIRECTS_FILE` to their locations.

## Configuration

The handler uses these environment variables:

- `CANONICALS_FILE` and `REDIRECTS_FILE` set paths to the required JSON data
  files. The published package does not provide them.
- `SOURCE_CONTENT` sets the content server URL. It defaults to
  `http://localhost:8100/`.
- `SOURCE_API` sets the API URL. It defaults to
  `https://developer.allizom.org/`.
- `SOURCE_SHARED_ASSETS` sets the shared assets URL. It defaults to
  `https://mdn.github.io/shared-assets/`.
- `ORIGIN_MAIN`, `ORIGIN_LIVE_SAMPLES`, and `ORIGIN_PLAY` set accepted
  hostnames.
- `REVIEW_ROUTING` enables review subdomain routing and disables response
  caching.
- `SIGN_SECRET` is required for serving placements.

Other optional variables and their defaults are defined in
[`src/env.js`](src/env.js).

## Releasing

The release workflow uses release-please to open draft release pull requests
from conventional commits that change `cloud-function/`. Merging a release pull
request publishes the package with npm provenance. Configure npm Trusted
Publishing for `@mdn/dex-cloud-server` to use the `mdn/dex` repository and
`.github/workflows/npm-publish.yml`, and configure the
`RELEASE_PLEASE_GITHUB_TOKEN` repository secret.

## Development

In a Dex checkout, `npm start` serves the handler at http://localhost:7100/. By
default, it serves the local `client/build` directory at http://localhost:8100/
and proxies API requests to the stage API at `https://developer.allizom.org/`.
Override defaults through a `.env` file with `KEY=value` lines.

To use a local Rumba, set `SOURCE_API=http://localhost:8000/`.

To use Glean, the handler must be accessed via HTTPS. Otherwise the Glean.js SDK
throws an uncaught error that prevents execution of JavaScript. Create a
locally-trusted certificate with [mkcert](https://github.com/FiloSottile/mkcert)
and set `HTTPS_KEY_FILE` and `HTTPS_CERT_FILE` to the key and certificate paths.
This enables an HTTPS proxy at https://localhost/ in addition to
http://localhost:7100/.
