import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";

export default [
  { ignores: ["dist/", "node_modules/"] },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    ...js.configs.recommended,
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  ...tseslint.configs.strictTypeChecked.map((c) => ({
    ...c,
    files: ["**/*.{ts,tsx,mts,cts,svelte}"],
  })),
  ...svelte.configs.recommended,
  {
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/require-await": "off" },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts,svelte}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.worker.json", "./tsconfig.config.json", "./tsconfig.tests.json"],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".svelte"],
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true, allowBoolean: true }],
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      "@typescript-eslint/no-unnecessary-condition": ["error", { allowConstantLoopConditions: "only-allowed-literals" }],
      "prefer-const": ["error", { destructuring: "all" }],
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
];
