# Dex

MDN's deployment infrastructure.

## Overview

- [`/.github/workflows`](./.github/workflows) contains the following workflows:
  - `auto-merge` to merge Dependabot PRs automatically
  - `pr-deployer` tests PRs that change Deployer (see below)
  - `prod-build`, `stage-build`, and `test-build` deploys MDN to the `prod`,
    `stage`, and `test` environments
  - `testing` lints and tests PRs
- [`/assets`](./assets) contains `robots.txt` files used by
- [`/client/public/assets`](./client/public/assets) contains MDN Plus assets for
  deployment
- [`/cloud-function`](./cloud-function/) contains the code for the Google Cloud
  Function serving MDN
- [`/deployer`](./deployer) contains the code that populates MDN's full-text
  search index
- [`/scripts`](./scripts) contains the following scripts:
  - `ai-help-macros.ts` updates the AI Help index
  - `reorder-search-index.mjs` reorders one search index based on another
- [`/tool`](./tool) contains the `whatsdeployed` command

## Commands

| Command                   | Description                                                                     |
| ------------------------- | ------------------------------------------------------------------------------- |
| `npm run check:tsc`       | Runs the TypeScript compiler to check types in all directories using TypeScript |
| `npm run eslint`          | Runs ESLint in the current directory                                            |
| `npm run install:all`     | Runs `npm install` in all subdirectories with `package-lock.json`               |
| `npm run jest`            | Runs Jest                                                                       |
| `npm run prepare`         | Installs dependencies in all subdirectories                                     |
| `npm run prettier-check`  | Checks all files against the Prettier formatting standard                       |
| `npm run prettier-format` | Formats all files according to the Prettier formatting standard                 |
| `npm run test`            | Runs `prettier-check` and `test:libs` (see below)                               |
| `npm run test:libs`       | Runs the unit test in the `/libs` folder                                        |
| `npm run tool:legacy`     | Runs the CLI providing the `whatsdeployed` command (see above)                  |
