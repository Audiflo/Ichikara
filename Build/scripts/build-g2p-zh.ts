/**
 * Build script: compile checked-in ICU Han readings and reviewed phrase
 * readings into the Mandarin G2P dictionary.
 *
 * The raw character table is generated once from ICU's Han-Latin transliterator
 * and stored at data/pinyin/icu-han-pinyin.txt
 * 
 * Output: src/langs/data/zh-g2p.json and zh-g2p.cjs as
 * `module.exports = { "回": ["hui2"], ... }`.
 * Run as: npm run build:g2p:zh
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PINYIN_SYLLABLES } from "../src/langs/detect";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const buildRoot = resolve(__dirname, "..");
const CHAR_PATH = resolve(buildRoot, "data/pinyin/icu-han-pinyin.txt");
const PHRASE_PATH = resolve(buildRoot, "data/pinyin/zh-phrases.txt");
const OUT_PATH = resolve(buildRoot, "src/langs/data/zh-g2p.json");

const HAN = /^[\u4e00-\u9fff]+$/;
const TONE_MARKS: Readonly<Record<string, string>> = {
  "\u0304": "1",
  "\u0305": "1",
  "\u0301": "2",
  "\u030c": "3",
  "\u0300": "4",
};

function normalizeSyllable(raw: string): string | null {
  const decomposed = raw.toLowerCase().normalize("NFD").replace(/u\u0308/g, "v");
  let tone = "";
  const stripped = decomposed.replace(/[\u0304\u0305\u0301\u030c\u0300]/g, (mark) => {
    const digit = TONE_MARKS[mark];
    if (digit !== undefined) tone = digit;
    return "";
  });
  const trailing = stripped.match(/([1-5])$/);
  if (trailing?.[1] !== undefined) tone = trailing[1];
  const base = stripped.replace(/[1-5]$/, "").normalize("NFC");
  if (!PINYIN_SYLLABLES.has(base)) return null;
  return `${base}${tone}`;
}

function parseReadings(raw: string): string[] | null {
  const syllables = raw.trim().split(/\s+/).map(normalizeSyllable);
  if (syllables.length === 0 || syllables.some((syllable) => syllable === null)) return null;
  return syllables as string[];
}

function readDictionary(path: string, strictReadings: boolean): Map<string, string[]> {
  if (!existsSync(path)) throw new Error(`[build-g2p-zh] Missing ${path}`);
  const map = new Map<string, string[]>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("\t");
    if (separator < 0) throw new Error(`[build-g2p-zh] Expected tab separator in ${path}: ${trimmed}`);
    const key = trimmed.slice(0, separator).trim();
    if (!HAN.test(key)) throw new Error(`[build-g2p-zh] Invalid Han key in ${path}: ${key}`);
    const readings = parseReadings(trimmed.slice(separator + 1));
    if (readings === null) {
      if (strictReadings) throw new Error(`[build-g2p-zh] Invalid pinyin reading in ${path}: ${trimmed}`);
      continue;
    }
    if (!map.has(key)) map.set(key, readings);
  }
  return map;
}

function main(): void {
  const dictionary = readDictionary(CHAR_PATH, false);
  for (const [phrase, readings] of readDictionary(PHRASE_PATH, true)) dictionary.set(phrase, readings);
  const sorted: Record<string, string[]> = {};
  for (const [key, readings] of [...dictionary.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    sorted[key] = readings;
  }
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(sorted)}\n`);
  writeFileSync(OUT_PATH.replace(/\.json$/, ".cjs"), `module.exports = ${JSON.stringify(sorted)};\n`);
  console.log(`[build-g2p-zh] wrote ${dictionary.size} entries to ${OUT_PATH}`);
}

main();
