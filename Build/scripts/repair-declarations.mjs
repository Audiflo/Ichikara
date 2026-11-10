import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

function readDeclaration(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(`Cannot read declaration; review repair for ${path}`, { cause });
  }
}

function usesCoreImport(path, source) {
  // Resolve the import's symbol so comments, property names, and shadowed names do not count as references.
  // See https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
  const fileName = path.replaceAll("\\", "/");
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const options = { noLib: true, noResolve: true, types: [] };
  const host = { ...ts.createCompilerHost(options), getSourceFile: (name) => (name === fileName ? file : undefined) };
  const checker = ts.createProgram([fileName], options, host).getTypeChecker();
  const statement = file.statements.find(
    (node) => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "./core.d.ts",
  );
  const binding = statement?.importClause?.namedBindings;
  if (!binding || !ts.isNamespaceImport(binding) || binding.name.text !== "core") {
    throw new Error("UtaFormatix core import changed; the declaration repair needs review");
  }
  const symbol = checker.getSymbolAtLocation(binding.name);
  if (!symbol) throw new Error("Cannot resolve the UtaFormatix core import; the declaration repair needs review");
  function referenced(node) {
    if (ts.isIdentifier(node) && node !== binding.name && node.text === "core") {
      const target = ts.isExportSpecifier(node.parent)
        ? checker.getExportSpecifierLocalTargetSymbol(node.parent)
        : checker.getSymbolAtLocation(node);
      if (target === symbol) return true;
    }
    return ts.forEachChild(node, referenced) === true;
  }
  return referenced(file);
}

function replaceDeclaration(path, before, after) {
  const source = readDeclaration(path);
  if (source.includes(after)) return;
  const match = before.find((candidate) => source.includes(candidate));
  if (!match) throw new Error(`Declaration changed upstream; review repair for ${path}`);
  writeFileSync(
    path,
    source.replace(match, () => after),
  );
}

// The published 0.4.1 declaration imports a nonexistent, unused core.d.ts.
// Remove only that import, preserving every public type and runtime file.
// See https://jsr.io/@sevenc-nanashi/utaformatix-ts/0.4.1/base.ts
const entry = fileURLToPath(import.meta.resolve("@sevenc-nanashi/utaformatix-ts/base"));
const declaration = resolve(dirname(entry), "_dist/base.d.ts");
const brokenImport = 'import * as core from "./core.d.ts";';
const source = readDeclaration(declaration);
if (source.includes(brokenImport)) {
  const corrected = source.replace(brokenImport, "");
  if (usesCoreImport(declaration, source)) {
    throw new Error("UtaFormatix now uses its core import; the declaration repair needs review");
  }
  writeFileSync(declaration, corrected);
}

// Component's `Bindings extends keyof Props` expands large prop unions beyond TS's complexity limit
// See https://github.com/sveltejs/svelte/blob/main/packages/svelte/types/index.d.ts
const bits = dirname(fileURLToPath(import.meta.resolve("bits-ui")));
for (const [name, bindings] of [
  ["Button", '"ref"'],
  ["Calendar", '"value" | "placeholder" | "ref"'],
]) {
  const component = name.toLowerCase();
  const corrected = `declare const ${name}: Omit<import("svelte").Component<{}>, "z_$$bindings"> & {
    (this: void, internals: import("svelte").ComponentInternals, props: ${name}RootProps):
        Omit<ReturnType<import("svelte").Component<{}>>, "$set"> & {
            $set?(props: Partial<${name}RootProps>): void;
        };
    z_$$bindings?: ${bindings};
};`;
  // Earlier repairs used a replacement string, which collapsed each $$ to $.
  replaceDeclaration(
    resolve(bits, `bits/${component}/components/${component}.svelte.d.ts`),
    [`declare const ${name}: import("svelte").Component<${name}RootProps, {}, ${bindings}>;`, corrected.replaceAll("$$", "$")],
    corrected,
  );
}
