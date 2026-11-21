export type NotationId = string;

export const IPA = "ipa";
export const ARPABET = "arpabet";
export const VOCALOID_SAMPA = "vocaloid-sampa";

export const SILENCE = "∅";

/** A phoneme notation adapter. `toIpa` and `fromIpa` are the only required conversion data. */
export interface NotationDefinition {
  id: NotationId;
  toIpa: Readonly<Record<string, readonly string[]>>;
  fromIpa: Readonly<Record<string, string | readonly string[]>>;
  tokenize?(input: string | readonly string[]): string[];
}

export interface PhonematixRegistry {
  extend(definition: NotationDefinition): PhonematixRegistry;
  get(id: NotationId): NotationDefinition;
  has(id: NotationId): boolean;
  ids(): readonly NotationId[];
}

export interface ConvertOptions {
  from: NotationId;
  to: NotationId;
  registry?: PhonematixRegistry;
}
