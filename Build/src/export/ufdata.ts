import type { Score } from "../core/types";
import type { generateUstx, GenerateParams } from "@sevenc-nanashi/utaformatix-ts/base";
import { elementAt, integerInRange } from "../core/validation";

/** Output format, project title, and pitch-export preferences. */
export interface ExportOptions {
  format?: string;
  projectName?: string;
  pitch?: boolean;
}

type FormatModule = typeof import("@sevenc-nanashi/utaformatix-ts/base");
type ExportData = Parameters<typeof generateUstx>[0];
type GenerateFn = (data: ExportData, params?: Partial<GenerateParams>) => Promise<Uint8Array | Uint8Array[]>;
type GeneratorName = { [K in keyof FormatModule]: FormatModule[K] extends GenerateFn ? K : never }[keyof FormatModule];
const FORMAT_RESOLUTION = 480;

const FORMAT_GENERATORS: Readonly<Record<string, GeneratorName>> = {
  ustx: "generateUstx",
  vsqx: "generateVsqx",
  vsq: "generateVsq",
  vpr: "generateVpr",
  svp: "generateSvp",
  s5p: "generateS5p",
  ccs: "generateCcs",
  dv: "generateDv",
  mid: "generateStandardMid",
  midi: "generateStandardMid",
  musicxml: "generateMusicXml",
  xml: "generateMusicXml",
  tssln: "generateTssln",
  ust: "generateUst",
};

function buildTrackPitch(notes: Score["notes"], scale: number): { ticks: number[]; values: number[] } | undefined {
  const totalTicks: number[] = [];
  const totalValues: number[] = [];

  for (const note of notes) {
    if (!note.pitchBend) continue;
    if (note.pitchBend.ticks.length !== note.pitchBend.values.length)
      throw new RangeError("Pitch ticks and values must have equal lengths");
    const noteStart = note.tick ?? 0;
    for (const [i, tick] of note.pitchBend.ticks.entries()) {
      totalTicks.push(Math.round((noteStart + tick) * scale));
      totalValues.push(elementAt(note.pitchBend.values, i) + note.noteNum);
    }
  }

  if (!totalTicks.length) return undefined;

  const combined = totalTicks.map((t, i) => ({ tick: t, value: elementAt(totalValues, i) }));
  combined.sort((a, b) => a.tick - b.tick);

  const mergedTicks: number[] = [];
  const mergedValues: number[] = [];
  for (const pt of combined) {
    const last = mergedTicks.length - 1;
    if (last >= 0 && mergedTicks[last] === pt.tick && mergedValues[last] === pt.value) continue;
    mergedTicks.push(pt.tick);
    mergedValues.push(pt.value);
  }

  return { ticks: mergedTicks, values: mergedValues };
}

/** Convert a score to UtaFormatix's 480-tick timeline; reject invalid resolution or pitch arrays.
 * See https://github.com/sdercolin/utaformatix-data
 */
export function scoreToUfData(score: Score, options: ExportOptions = {}): ExportData {
  const { projectName = "Untitled" } = options;
  integerInRange(score.resolution, "resolution", 1);
  const scale = FORMAT_RESOLUTION / score.resolution;
  let nextTick = 0;
  const notes = score.notes.map((note) => {
    const tick = note.tick ?? nextTick;
    nextTick = tick + note.length;
    return { ...note, tick };
  });

  const trackNotes = notes.map((n) => ({
    key: n.noteNum,
    tickOn: Math.round(n.tick * scale),
    tickOff: Math.round((n.tick + n.length) * scale),
    lyric: n.lyric,
    ...(n.phonemes ? { phoneme: n.phonemes.join(" ") } : {}),
  }));

  const pitch = options.pitch !== false ? buildTrackPitch(notes, scale) : undefined;

  const tempos = score.tempos.map((t) => ({
    tickPosition: Math.round(t.tick * scale),
    bpm: t.tempo,
  }));

  return {
    formatVersion: 1,
    project: {
      name: projectName,
      tracks: [
        {
          name: score.voice ?? "Voice",
          notes: trackNotes,
          ...(pitch ? { pitch: { ticks: pitch.ticks, values: pitch.values, isAbsolute: true } } : {}),
        },
      ],
      timeSignatures: [{ measurePosition: 0, numerator: 4, denominator: 4 }],
      tempos,
      measurePrefix: 0,
    },
  };
}

function serializeUfData(data: unknown): Uint8Array {
  const json = JSON.stringify(data);
  return new TextEncoder().encode(json);
}

let _generators: Readonly<Record<string, GenerateFn>> | null = null;

async function lazyInit(): Promise<void> {
  if (_generators) return;
  const m = await import("@sevenc-nanashi/utaformatix-ts/base");
  _generators = Object.fromEntries(Object.entries(FORMAT_GENERATORS).map(([ext, name]) => [ext, m[name]]));
}

/** Generate one track's project bytes; reject unsupported formats and converter failures. */
export async function exportScoreToBytes(score: Score, options: ExportOptions = {}): Promise<Uint8Array> {
  return exportUfDataToBytes(scoreToUfData(score, options), options);
}

/** Generate a complete interchange document. Multi-file formats must be exported as individual tracks. */
export async function exportUfDataToBytes(ufData: ExportData, options: ExportOptions = {}): Promise<Uint8Array> {
  const fmt = (options.format ?? "ustx").toLowerCase();

  if (fmt === "ufdata") {
    return serializeUfData(ufData);
  }

  if (!FORMAT_GENERATORS[fmt]) {
    throw new Error(`Unsupported export format: ${fmt}`);
  }

  await lazyInit();
  const gen = _generators?.[fmt];
  if (!gen) throw new Error(`Unsupported export format: ${fmt}`);
  const result = await gen(ufData, { pitch: options.pitch ?? true });
  if (Array.isArray(result)) {
    if (result.length !== 1) throw new Error("This format produces multiple files. Choose USTX for a complete song.");
    return result[0] ?? new Uint8Array(0);
  }
  return result;
}

/** Generate a project Blob; propagate conversion errors. */
export function exportScoreToBlob(score: Score, options: ExportOptions = {}): Promise<Blob> {
  return exportScoreToBytes(score, options).then((bytes) => new Blob([new Uint8Array(bytes)]));
}

/** Generate an object URL; the caller owns URL.revokeObjectURL after use. */
export function exportScoreToUrl(score: Score, options: ExportOptions = {}): Promise<string> {
  return exportScoreToBlob(score, options).then((blob) => URL.createObjectURL(blob));
}

/** Download the generated project in a browser; propagate conversion errors. */
export function downloadScore(score: Score, options: ExportOptions = {}): Promise<void> {
  const fmt = options.format ?? "ustx";
  const filename = `${options.projectName ?? "Untitled"}.${fmt}`;
  return exportScoreToUrl(score, options).then((url) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}
