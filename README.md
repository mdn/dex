# Dex

MDN's deployment infrastructure.

## Overview

- `/.github/workflows` contains the following workflows:
  - `auto-merge`, to merge Dependabot PRs automatically
  - `pr-deployer`, to test PRs that change Deployer (see below)
  - `prod-build`, `stage-build`, and `test-build`, to deploy MDN on the `prod`,
    `stage`, and `test` environments
  - `testing`, to lint and test PRs
- `/assets` contains `robots.txt` files used by
- `/client/public/assets` contains MDN Plus assets for deployment
- [`/cloud-function`](./cloud-function/README.md) contains the code for the
  Google Cloud Function serving MDN
- `/deployer` contains the code that populates MDN's full-text search index
- `/libs` contains reusable libraries
- `/markdown/h2m` provides a function to convert HTML to Markdown
- `/scripts` contains the following scripts:
  - `ai-help-macros.ts`, to update the AI Help index
  - `reorder-search-index.mjs`, to reorder one search index based on another
- `/tool` contains the `whatsdeployed` command

## Commands

- `yarn check:tsc` runs the TypeScript compiler to check types in all
  directories using TypeScript
- `yarn eslint` runs ESLint in the current directory
- `yarn install:all` runs `yarn install` in all subdirectories with `yarn.lock`
- `yarn install:all:npm` runs `npm install` in all subdirectories with
  `package-lock.json`
- `yarn jest` runs Jest
- `yarn prepare` installs dependencies in all subdirectories
- `yarn prettier-check` checks all files against the Prettier formatting
  standard
- `yarn prettier-format` formats all files according to the Prettier formatting
  standard
- `yarn test` runs `prettier-check` and `test:libs` (see below)
- `yarn test:libs` runs the unit test in the `/libs` folder
- `yarn tool:legacy` runs the CLI providing the `whatsdeployed` command (see
  above)
