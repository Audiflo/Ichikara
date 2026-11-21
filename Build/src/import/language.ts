import { english, hasEnglishPronunciation } from "../langs/english";
import type { UfData } from "./ufdata";

/** Language codes offered by the editor's per-track selector. */
export type ImportLanguage = "jp" | "en" | "zh";

/** Best language guess and whether the evidence is strong enough to skip review. */
export interface LanguageDetection {
  language: ImportLanguage;
  confident: boolean;
}

type UfTrack = UfData["project"]["tracks"][number];

const KANA = /[\u3040-\u30ff]/;
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const LATIN_WORD = /[a-z]+/gi;
const ARPABET = new Set([...english.phonemes.keys()].filter((symbol) => /^[A-Z]/.test(symbol)));

const JAPANESE_ROMAJI = /^(?:[kgsztdcbphmyrnwfjv]?[aiueo]|n|nn|ts[aiueo]|sh[aiueo]|ch[aiueo]|jy[aiueo]|ry[aiueo]|gy[aiueo]|by[aiueo]|py[aiueo]|my[aiueo]|ny[aiueo]|hy[aiueo]|fy[aiueo]|vy[aiueo])$/;
const AMBIGUOUS_ROMAJI = new Set(["a", "e", "i", "o", "u", "n", "an", "as", "at", "do", "ha", "he", "hi", "in", "is", "it", "me", "my", "no", "oh", "on", "so", "to", "up", "us", "we"]);
const JAPANESE_VOWELS = new Set(["a", "e", "i", "o", "u"]);

const VOCALOID_ENGLISH_PHONEMES = new Set([
  "D",
  "I",
  "I@",
  "N",
  "O:",
  "O@",
  "Q",
  "Sil",
  "T",
  "U",
  "V",
  "@",
  "@U",
  "@r",
  "aI",
  "aU",
  "bh",
  "dh",
  "e@",
  "eI",
  "gh",
  "i:",
  "kh",
  "l0",
  "ph",
  "tS",
  "th",
  "u:",
  "{",
]);

function lyricWords(track: UfTrack): string[] {
  return track.notes.flatMap((note) => note.lyric.match(LATIN_WORD)?.map((word) => word.toLowerCase()) ?? []);
}

function phonemeTokens(track: UfTrack): string[] {
  return track.notes.flatMap((note) => (note.phoneme ?? "").trim().split(/\s+/).filter(Boolean));
}

function isEnglishPhoneme(token: string): boolean {
  return VOCALOID_ENGLISH_PHONEMES.has(token) || ARPABET.has(token);
}

function isJapaneseRomaji(word: string): boolean {
  return word.length <= 3 && (JAPANESE_VOWELS.has(word) || (JAPANESE_ROMAJI.test(word) && !AMBIGUOUS_ROMAJI.has(word)));
}

/** Guess an imported track's language from its lyrics and any converter-supplied phonemes. */
export function detectUfTrackLanguage(track: UfTrack): LanguageDetection {
  const lyrics = track.notes.map((note) => note.lyric).join(" ");
  if (KANA.test(lyrics)) return { language: "jp", confident: true };
  if (HAN.test(lyrics)) return { language: "zh", confident: true };

  const phonemes = phonemeTokens(track);
  if (phonemes.some(isEnglishPhoneme)) return { language: "en", confident: true };
  if (track.notes.some((note) => /\s/.test(note.lyric.trim()))) return { language: "en", confident: true };

  const words = lyricWords(track);
  const englishWords = [...new Set(words.filter((word) => word.length >= 4 && hasEnglishPronunciation(word)))];
  if (englishWords.length > 1 || englishWords.some((word) => word.length >= 5)) return { language: "en", confident: true };

  const romaji = words.filter(isJapaneseRomaji);
  if (words.length >= 4 && romaji.length / words.length >= 0.75) return { language: "jp", confident: true };
  if (words.length > 0) return { language: "en", confident: false };
  return { language: "jp", confident: false };
}

/** Detect every track in an interchange document, in source order. */
export function detectUfDataLanguages(data: UfData): LanguageDetection[] {
  return data.project.tracks.map(detectUfTrackLanguage);
}
