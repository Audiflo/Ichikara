import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const brokenImport = 'import * as core from "./core.d.ts";';
const script = pathToFileURL(resolve(__dirname, "../../../scripts/repair-declarations.mjs")).href;

describe("declaration repair", () => {
  let directory: string;
  let declaration: string;

  function fixture(relative: string, source: string): void {
    const path = join(directory, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }

  function repair() {
    const entries = {
      "@sevenc-nanashi/utaformatix-ts/base": pathToFileURL(join(directory, "utaformatix/base.js")).href,
      "bits-ui": pathToFileURL(join(directory, "bits/index.js")).href,
    };
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { registerHooks } from "node:module";
      const entries = ${JSON.stringify(entries)};
      registerHooks({
        resolve(specifier, context, nextResolve) {
          if (specifier.startsWith("@farmfe/")) throw new Error("Declaration repair must not require Farm");
          if (Object.hasOwn(entries, specifier)) return { url: entries[specifier], shortCircuit: true };
          return nextResolve(specifier, context);
        },
      });
      await import(${JSON.stringify(script)});
    `,
      ],
      { encoding: "utf8" },
    );
    if (result.error) throw result.error;
    return result;
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "ichikara-declarations-"));
    declaration = join(directory, "utaformatix/_dist/base.d.ts");
    for (const name of ["Button", "Calendar"]) {
      const bindings = name === "Button" ? '"ref"' : '"value" | "placeholder" | "ref"';
      fixture(
        `bits/bits/${name.toLowerCase()}/components/${name.toLowerCase()}.svelte.d.ts`,
        `declare const ${name}: import("svelte").Component<${name}RootProps, {}, ${bindings}>;`,
      );
    }
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("reports a review-repair error when the declaration is missing", () => {
    const result = repair();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/review repair/i);
    expect(result.stderr).toContain(declaration);
  });

  it("preserves Svelte's double-dollar binding marker and can rerun without changes", () => {
    fixture("utaformatix/_dist/base.d.ts", "export interface Note { lyric: string; }");
    const first = repair();
    expect(first.stderr).toBe("");
    expect(first.status).toBe(0);
    const components = ["button", "calendar"].map((name) => join(directory, `bits/bits/${name}/components/${name}.svelte.d.ts`));
    const corrected = components.map((path) => readFileSync(path, "utf8"));
    for (const source of corrected) {
      expect(source).toContain('"z_$$bindings"');
      expect(source).toContain("z_$$bindings?:");
    }
    for (const path of components) {
      writeFileSync(path, readFileSync(path, "utf8").replaceAll("$$", "$"));
    }
    const migrated = repair();
    expect(migrated.stderr).toBe("");
    expect(migrated.status).toBe(0);
    expect(components.map((path) => readFileSync(path, "utf8"))).toEqual(corrected);
    const second = repair();
    expect(second.stderr).toBe("");
    expect(second.status).toBe(0);
    expect(components.map((path) => readFileSync(path, "utf8"))).toEqual(corrected);
  });

  it.each([
    "export interface Note { lyric: string; }",
    "// core.Note is mentioned in documentation\nexport interface Note { core: string; }",
    '/** core is historical. */ export type Label = "core.Note";',
    "export declare namespace Local { interface core { lyric: string; } type Note = core; }",
  ])("removes the unused import without changing unrelated content: %s", (body) => {
    fixture("utaformatix/_dist/base.d.ts", `${brokenImport}\n${body}`);
    const first = repair();
    expect(first.stderr).toBe("");
    expect(first.status).toBe(0);
    expect(readFileSync(declaration, "utf8")).toBe(`\n${body}`);
    const second = repair();
    expect(second.stderr).toBe("");
    expect(second.status).toBe(0);
    expect(readFileSync(declaration, "utf8")).toBe(`\n${body}`);
  });

  it.each(["export type Note = core.Note;", "export type Namespace = typeof core;", "export { core };", "export { core as engine };"])(
    "refuses to remove a referenced namespace: %s",
    (body) => {
      const source = `${brokenImport}\n${body}`;
      fixture("utaformatix/_dist/base.d.ts", source);
      const result = repair();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/core import.*review/);
      expect(readFileSync(declaration, "utf8")).toBe(source);
    },
  );
});
