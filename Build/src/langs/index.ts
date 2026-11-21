import type { LanguageModule } from "../core/types";
import { japanese } from "./japanese";
import { english } from "./english";
import { mandarin } from "./mandarin";
import { toCanonical, sequenceToCanonical } from "./alias";

const registry = new Map<string, LanguageModule>([
  ["jp", japanese],
  ["ja", japanese],
  ["en", english],
  ["eng", english],
  ["zh", mandarin],
  ["cmn", mandarin],
]);

export function getLanguage(id: string): LanguageModule | undefined {
  return registry.get(id.toLowerCase());
}

/** List the distinct registered language modules, with alias keys collapsed. */
export function listLanguages(): LanguageModule[] {
  return [...new Set(registry.values())];
}

/** Detect the most likely language for a set of lyrics.
 *
 *  Each module scores the lyrics through its optional `detectLikelihood` hook;
 *  the highest score wins and no positive score leaves the fallback unchanged.
 *  Aliases are collapsed so the same module is never counted twice.
 *
 *  @param lyrics Lyric strings from the notes being classified.
 *  @param fallback Identifier to return when no module reports a positive score.
 *  @returns The canonical identifier of the best-matching module, or `fallback`.
 */
export function detectLanguage(lyrics: readonly string[], fallback = "jp"): string {
  let best = fallback;
  let bestScore = 0;
  for (const lang of listLanguages()) {
    const score = lang.detectLikelihood?.(lyrics) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = lang.id;
    }
  }
  return best;
}

export function registerLanguage(lang: LanguageModule): void {
  registry.set(lang.id.toLowerCase(), lang);
}

export { japanese, english, mandarin, toCanonical, sequenceToCanonical };
