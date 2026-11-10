import type { LanguageModule, PhonemeDef, ReclistEntry, ReclistStyle, VoiceConfig } from "../core/types";
import { encodeWav } from "../core/dsp/wav";
import { renderPhonemes } from "../synth/renderer";
import { getLanguage } from "../langs";
import { elementAt, finiteInRange, integerInRange } from "../core/validation";

const DEFAULT_TEMPO = 120;
const DEFAULT_RESOLUTION = 480;
const SAMPLE_TICKS = 960;
const MAX_FILENAME_BYTES = 255;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

/** Rendered mono sample and oto timing, in milliseconds. Cutoff is a negative duration. */
export interface VoicebankSample {
  alias: string;
  filename: string;
  wav: ArrayBuffer;
  offset: number;
  consonant: number;
  cutoff: number;
  preutter: number;
  overlap: number;
}

/** Portable voicebank files ready to write to a single directory. */
export interface VoicebankBundle {
  language: string;
  style: ReclistStyle;
  pitch: number;
  characterTxt: string;
  otoIni: string;
  samples: VoicebankSample[];
}

/** Language, voice, and timing used to render each reclist sample. */
export interface BuildVoicebankOptions {
  language: string | LanguageModule;
  voice: VoiceConfig;
  style: ReclistStyle;
  pitch?: number;
  tempo?: number;
  resolution?: number;
  sampleTicks?: number;
  characterName?: string;
}

function aliasToFilename(alias: string): string {
  const safe = alias.replace(/[^A-Za-z0-9]/g, "_");
  return `${WINDOWS_DEVICE.test(safe) ? "_" : ""}${safe}.wav`;
}

function validateIniField(value: string, name: string): void {
  if (!value.trim() || /[,=]/.test(value) || Array.from(value).some((char) => char.charCodeAt(0) < 32)) {
    throw new Error(`buildVoicebank: invalid ${name}`);
  }
}

function validateFilename(filename: string): void {
  validateIniField(filename, "filename");
  if (
    !/\.wav$/i.test(filename) ||
    /[<>:"/\\|?*]/.test(filename) ||
    WINDOWS_DEVICE.test(filename) ||
    new TextEncoder().encode(filename).length > MAX_FILENAME_BYTES
  ) {
    throw new Error(`buildVoicebank: invalid filename "${filename}"`);
  }
}

function allocateFilenames(entries: ReclistEntry[]): (ReclistEntry & { filename: string })[] {
  const aliases = new Set<string>();
  const filenames = new Set<string>();
  return entries.map((entry) => {
    validateIniField(entry.alias, "alias");
    if (aliases.has(entry.alias)) throw new Error(`buildVoicebank: duplicate alias "${entry.alias}"`);
    aliases.add(entry.alias);
    if (!entry.phonemes.length) throw new Error(`buildVoicebank: empty phonemes for alias "${entry.alias}"`);
    const requested = entry.filename ?? aliasToFilename(entry.alias);
    validateFilename(requested);
    let filename = requested;
    let suffix = 2;
    // UTAU banks are commonly used on case-insensitive Windows and macOS volumes.
    while (filenames.has(filename.normalize("NFC").toLowerCase())) {
      filename = `${requested.slice(0, -4)}_${suffix}.wav`;
      suffix++;
    }
    validateFilename(filename);
    filenames.add(filename.normalize("NFC").toLowerCase());
    return { ...entry, filename };
  });
}

function computeOto(
  phonemes: PhonemeDef[],
  phonemeStarts: number[],
  noteLen: number,
  sr: number,
): { offset: number; consonant: number; cutoff: number; preutter: number; overlap: number } {
  let fv = phonemes.length - 1;
  for (let i = phonemes.length - 1; i >= 0; i--) {
    const phoneme = elementAt(phonemes, i);
    if (phoneme.type === "vowel" || phoneme.type === "diphthong") {
      fv = i;
      break;
    }
  }
  const vowelStart = phonemeStarts[fv] ?? 0;

  let offset = 0;
  for (let i = fv - 1; i >= 0; i--) {
    if (elementAt(phonemes, i).type === "consonant") offset = elementAt(phonemeStarts, i);
    else break;
  }

  const ms = (samples: number) => Math.round((samples / sr) * 1000);
  const preutter = ms(vowelStart - offset);
  const consonant = preutter;
  const overlap = Math.round(preutter / 2);
  const cutoff = -ms(noteLen - offset);
  return { offset: ms(offset), consonant, cutoff, preutter, overlap };
}

function bakeEntry(
  entry: ReclistEntry & { filename: string },
  lang: LanguageModule,
  opts: Required<Omit<BuildVoicebankOptions, "language" | "voice" | "characterName">> & {
    voice: VoiceConfig;
    characterName: string;
  },
): VoicebankSample {
  const phonemes = entry.phonemes.map((s) => {
    const p = lang.phonemes.get(s);
    if (!p) throw new Error(`buildVoicebank: missing phoneme "${s}" for alias "${entry.alias}"`);
    return p;
  });

  const note = {
    lyric: entry.alias,
    noteNum: opts.pitch,
    length: opts.sampleTicks,
    vibratoOverride: { depth: 0, rate: opts.voice.vibrato.rate, attack: opts.voice.vibrato.attack },
  };

  const { chunk, phonemeStarts } = renderPhonemes(phonemes, note, opts.voice, opts.tempo, opts.resolution);
  const noteLen = elementAt(chunk.data, 0).length;
  const oto = computeOto(phonemes, phonemeStarts, noteLen, opts.voice.sampleRate);
  const filename = entry.filename;
  const wav = encodeWav([chunk]);

  return { alias: entry.alias, filename, wav, ...oto };
}

/** Render a voicebank, rejecting invalid options, ambiguous aliases, and unsafe filenames.
 * Generated filenames are unique under case folding; throws before rendering on invalid metadata.
 */
export function buildVoicebank(options: BuildVoicebankOptions): VoicebankBundle {
  const lang = typeof options.language === "string" ? getLanguage(options.language) : options.language;
  if (!lang)
    throw new Error(`buildVoicebank: unknown language "${typeof options.language === "string" ? options.language : options.language.id}"`);
  if (!lang.reclist) {
    throw new Error(`buildVoicebank: language "${lang.id}" does not provide a reclist generator`);
  }

  const resolved = {
    voice: { ...options.voice, channels: 1 as const },
    style: options.style,
    pitch: options.pitch ?? 60,
    tempo: options.tempo ?? DEFAULT_TEMPO,
    resolution: options.resolution ?? DEFAULT_RESOLUTION,
    sampleTicks: options.sampleTicks ?? SAMPLE_TICKS,
    characterName: options.characterName ?? options.voice.name,
  };
  if (!new Set<string>(["cv", "vcv"]).has(resolved.style)) throw new Error("buildVoicebank: style must be cv or vcv");
  integerInRange(resolved.pitch, "pitch", 0, 127);
  finiteInRange(resolved.tempo, "tempo", Number.MIN_VALUE);
  integerInRange(resolved.resolution, "resolution", 1);
  integerInRange(resolved.sampleTicks, "sampleTicks", 1);
  integerInRange(resolved.voice.sampleRate, "sampleRate", 1);
  validateIniField(resolved.characterName, "characterName");

  const entries = allocateFilenames(lang.reclist(resolved.style));
  const samples = entries.map((e) => bakeEntry(e, lang, resolved));

  const otoLines = samples.map((s) => `${s.filename}=${s.alias},${s.offset},${s.consonant},${s.cutoff},${s.preutter},${s.overlap}`);
  const otoIni = otoLines.join("\n") + "\n";

  const characterTxt = `name=${resolved.characterName}\n`;

  return {
    language: lang.id,
    style: resolved.style,
    pitch: resolved.pitch,
    characterTxt,
    otoIni,
    samples,
  };
}
