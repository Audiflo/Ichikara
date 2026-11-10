import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/", "node_modules/", "data/", "src/langs/data/*.cjs", "voicebank/"] },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    ...js.configs.recommended,
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  ...tseslint.configs.strictTypeChecked.map((c) => ({
    ...c,
    files: ["**/*.{ts,tsx,mts,cts}"],
  })),
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: { project: "./tsconfig.check.json", tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      "@typescript-eslint/no-unnecessary-condition": ["error", { allowConstantLoopConditions: "only-allowed-literals" }],
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: { globals: globals.jest },
    rules: { "@typescript-eslint/require-await": "off" },
  },
];
