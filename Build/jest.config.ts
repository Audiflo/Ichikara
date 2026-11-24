import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.[tj]sx?$": ["ts-jest", { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: ["/node_modules/(?!@sevenc-nanashi/utaformatix-ts/)"],
};

export default config;
