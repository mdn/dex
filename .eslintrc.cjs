module.exports = {
  env: {
    browser: false,
    commonjs: true,
    es2020: true,
  },
  extends: ["eslint:recommended", "plugin:n/recommended"],
  plugins: ["unicorn"],
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly",
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    "one-var": ["error", "never"],
    "unicorn/prefer-node-protocol": "error",
  },
  reportUnusedDisableDirectives: true,
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      parser: "@typescript-eslint/parser",
      extends: [
        "plugin:@typescript-eslint/recommended",
        //"plugin:@typescript-eslint/stylistic",
      ],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": [
          "warn",
          { ignoreRestSiblings: true },
        ],
        "n/no-deprecated-api": "off",
        "n/no-missing-import": "off",
        "n/no-unpublished-import": "off",
        "n/hashbang": "off",
      },
    },
    {
      files: ["**/cli.js"],
      rules: {
        "n/shebang": 0,
        "no-process-exit": 0,
      },
    },
  ],
};
