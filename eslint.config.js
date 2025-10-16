import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import nPlugin from "eslint-plugin-n";
import unicornPlugin from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  eslint.configs.recommended,
  nPlugin.configs["flat/recommended-module"],
  unicornPlugin.configs["flat/recommended"],
  importPlugin.flatConfigs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "libs/",
      "cloud-function/src/internal/",
      "cloud-function/**/*.js",
      "tool/*.js",
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "import/named": "off",
      "import/no-duplicates": "off",
      "import/no-unresolved": "off",
      "n/hashbang": "off",
      "n/no-missing-import": "off",
      "one-var": ["error", "never"],
      "unicorn/catch-error-name": "off",
      "unicorn/consistent-function-scoping": "off",
      "unicorn/filename-case": "off",
      "unicorn/import-style": "off",
      "unicorn/new-for-builtins": "off",
      "unicorn/no-array-for-each": "off",
      "unicorn/no-await-expression-member": "off",
      "unicorn/no-negated-condition": "off",
      "unicorn/no-negation-in-equality-check": "off",
      "unicorn/no-nested-ternary": "off",
      "unicorn/no-null": "off",
      "unicorn/numeric-separators-style": "off",
      "unicorn/prefer-at": "off",
      "unicorn/prefer-native-coercion-functions": "off",
      "unicorn/prefer-node-protocol": "error",
      "unicorn/prefer-string-replace-all": "off",
      "unicorn/prefer-string-slice": "off",
      "unicorn/prefer-ternary": "off",
      "unicorn/prefer-top-level-await": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/switch-case-braces": "off",
      "unicorn/text-encoding-identifier-case": "off",
      "unicorn/throw-new-error": "off",
    },
  },
];
