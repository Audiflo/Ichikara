import { UnknownPhonemeError } from "./errors";
import { defaultRegistry } from "./registry";
import { tokenizeWith } from "./tokenize";
import { IPA, type ConvertOptions, type NotationDefinition } from "./types";

interface ReverseEntry {
  segments: readonly string[];
  symbols: readonly string[];
}

function reverseEntries(definition: NotationDefinition): ReverseEntry[] {
  return Object.entries(definition.fromIpa)
    .map(([key, value]) => ({
      segments: key.split(/\s+/).filter((segment) => segment.length > 0),
      symbols: typeof value === "string" ? value.split(/\s+/).filter((symbol) => symbol.length > 0) : value,
    }))
    .sort((a, b) => b.segments.length - a.segments.length);
}

function matchAt(segments: readonly string[], index: number, entries: readonly ReverseEntry[]): ReverseEntry | undefined {
  return entries.find((entry) => entry.segments.every((segment, offset) => segments[index + offset] === segment));
}

/** Converts a phoneme sequence between notations using IPA segments as the intermediate representation. */
export function convert(input: string | readonly string[], options: ConvertOptions): string[] {
  const registry = options.registry ?? defaultRegistry;
  const source = registry.get(options.from);
  const target = registry.get(options.to);
  const tokens = tokenizeWith(input, source);

  const ipa = tokens.flatMap((token) => {
    const segments = source.toIpa[token];
    if (segments === undefined) throw new UnknownPhonemeError(source.id, token);
    return [...segments];
  });

  if (target.id === IPA) return ipa;

  const entries = reverseEntries(target);
  const output: string[] = [];
  let index = 0;
  while (index < ipa.length) {
    const entry = matchAt(ipa, index, entries);
    if (entry === undefined) throw new UnknownPhonemeError(target.id, ipa.slice(index).join(" "));
    output.push(...entry.symbols);
    index += entry.segments.length;
  }
  return output;
}
