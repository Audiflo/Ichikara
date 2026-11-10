# Development checks

The library and editor extend `tsconfig.base.json`. Dependency declarations are
checked, including indexed access and exact optional properties. Browser and
worker code use separate compiler projects because DOM and WebWorker globals
cannot be loaded into the same TypeScript program.

Bits UI's generated declarations depend on CSS properties removed in `csstype`
3.2. The demo pins `csstype` to 3.1.3, matching Bits UI's build dependency, until
Bits UI regenerates those declarations against the newer CSS definitions.

## Commands

- `npm run typecheck` builds the library, then checks library source, tests,
  scripts, Svelte components, workers, and editor configuration.
- `npm run lint` runs type-aware strict ESLint without modifying files.
- `npm test` runs library and editor regression tests.
- `npm run check` runs the checks above and builds the production editor.
- `npm run lint:fix -w Build` or `-w Demo` applies ESLint's automatic fixes.

CI uses Node 22 and 24. Pages, npm releases, Updato, and the dependency audit use
Node 24. Use Node 22.18+ or 24.11+ locally to satisfy tsdown's runtime requirements
and support native type stripping for the editor's pure TypeScript tests.

The library's tsdown options live in the build command in `Build/package.json`.
Using its CLI avoids importing declarations for unused plugin integrations and
installing their optional bundlers. The build emits minified ESM and CommonJS,
declarations, and source maps. Source and dependency type checks remain strict.

## Dependency declarations

The root postinstall runs `Build/scripts/repair-declarations.mjs`. It preserves
runtime code and public prop types while repairing these published declarations:

- UtaFormatix 0.4.1 imports a nonexistent, unused `core.d.ts`.
- Bits UI 2.18.1 instantiates Svelte's `Component` with large prop unions.
  Computing its `keyof Props` binding constraint exceeds TypeScript's complexity
  limit. The repair spells out the same callable shape, including static members,
  legacy return members, typed `$set`, and exact binding names.

Repairs are idempotent and fail when their expected declaration changes. Review
them when updating dependencies. `skipLibCheck` remains disabled.

The Bits UI repair preserves literal `$$` binding markers and upgrades declarations
written by the earlier repair, which collapsed `$$` to `$`.
