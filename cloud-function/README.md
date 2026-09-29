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

Other optional variables and their defaults are documented in the source
checkout's cloud-function configuration.

## Releasing

The release workflow uses release-please to open draft release pull requests
from conventional commits that change `cloud-function/`. Merging a release pull
request publishes the package with npm provenance. Configure npm Trusted
Publishing for `@mdn/dex-cloud-server` to use the `mdn/dex` repository and
`.github/workflows/npm-publish.yml`, and configure the
`RELEASE_PLEASE_GITHUB_TOKEN` repository secret.
