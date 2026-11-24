import { UnknownNotationError } from "./errors";
import { arpabet } from "./notations/arpabet";
import { vocaloidSampa } from "./notations/vocaloid-sampa";
import { greedyTokenizer, tokenizeWith } from "./tokenize";
import { IPA, SILENCE, type NotationDefinition, type NotationId, type PhonematixRegistry } from "./types";

function collectIpaSegments(definitions: readonly NotationDefinition[]): string[] {
  const segments = new Set<string>([SILENCE]);
  for (const definition of definitions) {
    for (const values of Object.values(definition.toIpa)) {
      for (const value of values) segments.add(value);
    }
    for (const key of Object.keys(definition.fromIpa)) {
      for (const segment of key.split(/\s+/)) {
        if (segment.length > 0) segments.add(segment);
      }
    }
  }
  return [...segments];
}

function ipaNotation(segments: readonly string[]): NotationDefinition {
  const toIpa = Object.fromEntries(segments.map((segment) => [segment, [segment]]));
  const fromIpa = Object.fromEntries(segments.map((segment) => [segment, segment]));
  return { id: IPA, toIpa, fromIpa, tokenize: greedyTokenizer(IPA, toIpa) };
}

class Registry implements PhonematixRegistry {
  private readonly definitions = new Map<NotationId, NotationDefinition>();

  constructor(definitions: readonly NotationDefinition[] = []) {
    for (const definition of definitions) this.definitions.set(definition.id, definition);
  }

  extend(definition: NotationDefinition): PhonematixRegistry {
    const next = new Registry([...this.definitions.values()]);
    next.definitions.set(definition.id, definition);
    return next;
  }

  get(id: NotationId): NotationDefinition {
    const definition = this.definitions.get(id);
    if (definition === undefined) throw new UnknownNotationError(id);
    return definition;
  }

  has(id: NotationId): boolean {
    return this.definitions.has(id);
  }

  ids(): readonly NotationId[] {
    return [...this.definitions.keys()];
  }
}

/** Builds an isolated registry containing the bundled notation adapters. */
export function createRegistry(): PhonematixRegistry {
  const definitions = [vocaloidSampa, arpabet];
  return new Registry([...definitions, ipaNotation(collectIpaSegments(definitions))]);
}

export const defaultRegistry = createRegistry();

function tokenizeForDetection(input: string | readonly string[], definition: NotationDefinition): string[] | undefined {
  try {
    return tokenizeWith(input, definition);
  } catch {
    return undefined;
  }
}

/** Finds the bundled or registered notation that fully explains the input. */
export function detectNotation(input: string | readonly string[], registry: PhonematixRegistry = defaultRegistry): NotationId | undefined {
  const candidates: { id: NotationId; tokens: number; score: number }[] = [];

  for (const id of registry.ids()) {
    const definition = registry.get(id);
    const tokens = tokenizeForDetection(input, definition);
    if (tokens === undefined || tokens.length === 0) continue;
    if (!tokens.every((token) => Object.hasOwn(definition.toIpa, token))) continue;

    const characters = tokens.reduce((total, token) => total + Array.from(token).length, 0);
    candidates.push({ id, tokens: tokens.length, score: characters / tokens.length });
  }

  candidates.sort((a, b) => b.score - a.score || a.tokens - b.tokens);
  return candidates[0]?.id;
}
