# Deployer

Dex Deployer's only remaining purpose is to update the Elasticsearch index.

## Getting started

```sh
cd deployer-js
npm install
node main.js --help
```

## Elasticsearch indexing

You just need a URL (or host name) for an Elasticsearch server and the root of
the build directory. The command will trawl all `index.json` files and extract
all metadata and blocks of prose which get their HTML stripped. The command is:

```sh
node main.js search-index --help
```

If you have built the whole site (or partially) you simply point to it with the
first argument:

```sh
node main.js search-index ../client/build
```

By default, it does not specify the Elasticsearch URL/host. You can either use:

```sh
export DEPLOYER_ELASTICSEARCH_URL=http://localhost:9200
node main.js search-index ../client/build
```

...or...

```sh
node main.js search-index ../client/build --url http://localhost:9200
```

**Note!** If you don't specify either the environment variable or the `--url`
option, the script will _not_ fail (ie. exit non-zero). This is to make it
convenient in GitHub Actions to control the execution purely based on the
presence of the environment variable.

### About Elasticsearch aliases

The default behavior is that each run gets a different index name, e.g.
`mdn_docs_20210331093714`. There is also an alias with a more "generic" name,
`mdn_docs`. It is the alias name that Kuma uses to send search queries to.

The way indexing works is that we leave the existing index and its alias in
place, then we fill up a new index and once that works, we atomically "move the
alias" and delete the old index. To demonstrate, consider this example timeline:

- Yesterday: index `mdn_docs_20210330093714` and
  `mdn_docs --> mdn_docs_20210330093714`
- Today:
  - create new index `mdn_docs_20210331094500`
  - populate `mdn_docs_20210331094500` (could take a long time)
  - atomically re-assign alias `mdn_docs --> mdn_docs_20210331094500` and delete
    old index `mdn_docs_20210330093714`

**There is zero downtime for search queries.** Nothing needs to be reconfigured
on the Kuma side.

## Environment variables

- `DEPLOYER_ELASTICSEARCH_URL` used by the `search-index` command.

## Contributing

Run the unit tests:

```sh
npm test
```

Typecheck:

```sh
npm run check:tsc
```
