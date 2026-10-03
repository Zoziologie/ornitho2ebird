import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import vue from "eslint-plugin-vue";
import globals from "globals";

export default [
  {
    ignores: ["dist/", "node_modules/", "docs/", "public/", "test-results/", "playwright-report/"],
  },
  js.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, __APP_VERSION__: "readonly" },
    },
    rules: {
      "no-unused-vars": ["error", { ignoreRestSiblings: true, caughtErrors: "none" }],
      "vue/multi-word-component-names": "off",
    },
  },
  {
    files: ["*.js", "build/**/*.js", "test/**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  // Turns off the style rules that Prettier owns.
  prettier,
];
