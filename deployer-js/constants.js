// If you're doing local development, you can download and install your own
// instance of Elasticsearch and start it. Then set this environment variable
// value to `http://localhost:9200`
export const ELASTICSEARCH_URL =
  process.env["DEPLOYER_ELASTICSEARCH_URL"] ?? "";
