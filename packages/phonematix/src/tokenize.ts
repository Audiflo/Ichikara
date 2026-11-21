import { UnknownPhonemeError } from "./errors";
import type { NotationDefinition, NotationId } from "./types";

export function tokenizeWhitespace(input: string | readonly string[]): string[] {
  const values: readonly string[] = typeof input === "string" ? input.split(/\s+/) : input;
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function longestSymbols(table: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(table).sort((a, b) => Array.from(b).length - Array.from(a).length || b.localeCompare(a));
}

export function greedyTokenizer(notation: NotationId, table: Readonly<Record<string, unknown>>) {
  const symbols = longestSymbols(table);
  return (input: string | readonly string[]): string[] => {
    const chunks = tokenizeWhitespace(input);
    const tokens: string[] = [];

    for (const chunk of chunks) {
      const characters = Array.from(chunk);
      let index = 0;
      while (index < characters.length) {
        const remaining = characters.slice(index).join("");
        const symbol = symbols.find((candidate) => remaining.startsWith(candidate));
        if (symbol === undefined) throw new UnknownPhonemeError(notation, remaining);
        tokens.push(symbol);
        index += Array.from(symbol).length;
      }
    }

    return tokens;
  };
}

export function tokenizeWith(input: string | readonly string[], definition: NotationDefinition): string[] {
  return definition.tokenize?.(input) ?? tokenizeWhitespace(input);
}
