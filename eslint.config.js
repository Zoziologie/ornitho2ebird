import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import vue from "eslint-plugin-vue";
import globals from "globals";

export default [
  { ignores: ["dist/", "node_modules/", "docs/", "public/"] },
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
      // Panels still edit the forms and settings they receive. Turn back on once they go
      // through a store (see the structure checklist in PR #27).
      "vue/no-mutating-props": "off",
    },
  },
  {
    files: ["*.js", "build/**/*.js", "test/**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  // Turns off the style rules that Prettier owns.
  prettier,
];
