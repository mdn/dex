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
- [`/libs`](./libs) contains reusable libraries
- [`/markdown/h2m`](./markdown/h2m) contains a function to convert HTML to
  Markdown
- [`/scripts`](./scripts) contains the following scripts:
  - `ai-help-macros.ts` updates the AI Help index
  - `reorder-search-index.mjs` reorders one search index based on another
- [`/tool`](./tool) contains the `whatsdeployed` command

## Commands

| Command                | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `yarn check:tsc`       | Runs the TypeScript compiler to check types in all directories using TypeScript |
| `yarn eslint`          | Runs ESLint in the current directory                                            |
| `yarn install:all`     | Runs `yarn install` in all subdirectories with `yarn.lock`                      |
| `yarn install:all:npm` | Runs `npm install` in all subdirectories with `package-lock.json`               |
| `yarn jest`            | Runs Jest                                                                       |
| `yarn prepare`         | Installs dependencies in all subdirectories                                     |
| `yarn prettier-check`  | Checks all files against the Prettier formatting standard                       |
| `yarn prettier-format` | Formats all files according to the Prettier formatting standard                 |
| `yarn test`            | Runs `prettier-check` and `test:libs` (see below)                               |
| `yarn test:libs`       | Runs the unit test in the `/libs` folder                                        |
| `yarn tool:legacy`     | Runs the CLI providing the `whatsdeployed` command (see above)                  |
