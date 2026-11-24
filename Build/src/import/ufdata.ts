import type { Score, Note } from "../core/types";
import { elementAt } from "../core/validation";

interface UfPitch {
  ticks: number[];
  values: (number | null)[];
  isAbsolute: boolean;
}

interface UfTrack {
  name: string;
  notes: { key: number; tickOn: number; tickOff: number; lyric: string; phoneme?: string | null }[];
  pitch?: UfPitch | null;
}

/** Import-compatible UtaFormatix document, including nullable fields emitted by older converters. */
export interface UfData {
  formatVersion: number;
  project: {
    name: string;
    tracks: UfTrack[];
    tempos: { tickPosition: number; bpm: number }[];
    measurePrefix: number;
    timeSignatures?: { measurePosition: number; numerator: number; denominator: number }[];
  };
}

/** Select a track and control pitch import. */
export interface ImportOptions {
  trackIndex?: number;
  pitch?: boolean;
}

interface UfPitchPoint {
  tick: number;
  value: number;
}

function splitPitchPerNote(notes: Note[], trackPitch: UfPitch): void {
  const { ticks, values, isAbsolute } = trackPitch;
  if (ticks.length !== values.length) throw new RangeError("Pitch ticks and values must have equal lengths");
  if (!ticks.length) return;

  const points: UfPitchPoint[] = [];
  for (const [i, tick] of ticks.entries()) {
    const value = elementAt(values, i);
    if (value !== null) points.push({ tick, value });
  }
  points.sort((a, b) => a.tick - b.tick);

  const valueAtOrBefore = (tick: number): number | undefined => {
    let found: number | undefined;
    for (const point of points) {
      if (point.tick > tick) break;
      found = point.value;
    }
    return found;
  };

  for (const note of notes) {
    const noteStart = note.tick ?? 0;
    const noteEnd = noteStart + note.length;

    const relTicks: number[] = [];
    const relValues: number[] = [];

    for (const point of points) {
      if (point.tick < noteStart) continue;
      if (point.tick >= noteEnd) break;
      const relTick = point.tick - noteStart;
      const relValue = isAbsolute ? point.value - note.noteNum : point.value;
      if (relTicks.length > 0 && elementAt(relTicks, relTicks.length - 1) === relTick) {
        relValues[relValues.length - 1] = relValue;
      } else {
        relTicks.push(relTick);
        relValues.push(relValue);
      }
    }

    if (relTicks.length === 0) continue;

    if (elementAt(relTicks, 0) > 0) {
      const preceding = valueAtOrBefore(noteStart);
      relTicks.unshift(0);
      relValues.unshift(preceding === undefined ? 0 : isAbsolute ? preceding - note.noteNum : preceding);
    }

    const last = elementAt(relTicks, relTicks.length - 1);
    if (last < note.length) {
      const boundary = valueAtOrBefore(noteEnd);
      relTicks.push(note.length);
      relValues.push(boundary === undefined ? elementAt(relValues, relValues.length - 1) : isAbsolute ? boundary - note.noteNum : boundary);
    }

    note.pitchBend = { ticks: relTicks, values: relValues };
  }
}

/** Convert one track at 480 ticks per quarter; throw if the track or pitch layout is invalid. */
export function ufDataToScore(data: UfData, options: ImportOptions = {}): Score {
  const { trackIndex = 0, pitch = true } = options;
  const project = data.project;
  const track = project.tracks[trackIndex];
  if (!track) throw new Error(`Track ${trackIndex} not found (project has ${project.tracks.length} tracks)`);

  const tempos = project.tempos.map((t) => ({ tick: t.tickPosition, tempo: t.bpm }));
  const resolution = 480;

  if (!tempos.length) tempos.push({ tick: 0, tempo: 120 });

  const notes: Note[] = track.notes.map((n) => ({
    tick: n.tickOn,
    lyric: n.lyric,
    noteNum: n.key,
    length: Math.max(1, n.tickOff - n.tickOn),
    ...(n.phoneme?.trim() ? { phonemes: n.phoneme.trim().split(/\s+/) } : {}),
  }));

  if (pitch && track.pitch) {
    splitPitchPerNote(notes, track.pitch);
  }

  return { tempos, resolution, notes, voice: track.name };
}

type ParseInput = Uint8Array | File;
type ParseFn = (data: ParseInput, params?: { pitch?: boolean }) => Promise<UfData>;
type UtfModule = typeof import("@sevenc-nanashi/utaformatix-ts/base");

let utfModule: UtfModule | undefined;

async function lazyInit(): Promise<UtfModule> {
  if (!utfModule) utfModule = await import("@sevenc-nanashi/utaformatix-ts/base");
  return utfModule;
}

function extFromFile(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return name.toLowerCase();
  return name.slice(dot + 1).toLowerCase();
}

function isStringArray(value: string | readonly string[]): value is readonly string[] {
  return Array.isArray(value);
}

function normalizeInputs(
  input: ParseInput | readonly ParseInput[],
  filenames: string | readonly string[],
): { data: ParseInput | ParseInput[]; ext: string } {
  if (input instanceof Uint8Array || input instanceof File) {
    if (typeof filenames !== "string") throw new TypeError("A single file requires a single filename");
    return { data: input, ext: extFromFile(filenames) };
  }
  if (!isStringArray(filenames) || filenames.length !== input.length) {
    throw new TypeError("Every file in a multi-file import requires a filename");
  }
  if (input.length === 0) throw new TypeError("No files supplied for import");
  const ext = extFromFile(elementAt(filenames, 0));
  if (filenames.some((name) => extFromFile(name) !== ext)) {
    throw new Error("Multi-file import requires all files to share one format");
  }
  if (ext !== "ust") throw new Error(`Multi-file import does not support .${ext}; convert the files to .ust first`);
  const files = input.map((value, index) =>
    value instanceof File ? value : new File([new Uint8Array(value)], elementAt(filenames, index)),
  );
  return { data: files, ext };
}

/** Parse a supported singing-project file; propagate format and conversion errors. */
export async function importScoreFromFile(file: File, options: ImportOptions = {}): Promise<Score> {
  return ufDataToScore(await parseUfData(file, file.name, options.pitch ?? true), options);
}

/** Parse bytes using the filename extension; propagate format and conversion errors. */
export async function importScoreFromBytes(buf: Uint8Array, filename: string, options: ImportOptions = {}): Promise<Score> {
  return ufDataToScore(await parseUfData(buf, filename, options.pitch ?? true), options);
}

/** Parse all tracks using the filename extension; propagate unsupported format and converter errors.
 * Multiple inputs are supported only for `.ust`, where each file becomes one track.
 */
export async function parseUfData(input: ParseInput, filename: string, pitch?: boolean): Promise<UfData>;
export async function parseUfData(input: readonly ParseInput[], filenames: readonly string[], pitch?: boolean): Promise<UfData>;
export async function parseUfData(
  input: ParseInput | readonly ParseInput[],
  filenames: string | readonly string[],
  pitch = true,
): Promise<UfData> {
  const { data, ext } = normalizeInputs(input, filenames);
  const m = await lazyInit();
  if (Array.isArray(data)) return m.parseUst(data, { pitch });
  const parsers: Readonly<Record<string, ParseFn>> = { ...m.parseFunctions, midi: m.parseStandardMid };
  const parseFn = parsers[ext];
  if (!parseFn) throw new Error(`Unsupported file format: .${ext}`);
  return parseFn(data, { pitch });
}
