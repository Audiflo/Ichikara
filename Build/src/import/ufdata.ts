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

function splitPitchPerNote(notes: Note[], trackPitch: UfPitch): void {
  const { ticks, values, isAbsolute } = trackPitch;
  if (ticks.length !== values.length) throw new RangeError("Pitch ticks and values must have equal lengths");
  if (!ticks.length) return;

  for (const note of notes) {
    const noteStart = note.tick ?? 0;
    const noteEnd = noteStart + note.length;

    const relTicks: number[] = [];
    const relValues: number[] = [];

    for (const [i, t] of ticks.entries()) {
      const v = elementAt(values, i);
      if (v === null) continue;
      if (t >= noteStart && t <= noteEnd) {
        relTicks.push(t - noteStart);
        relValues.push(isAbsolute ? v - note.noteNum : v);
      }
    }

    if (relTicks.length === 0) continue;

    if (elementAt(relTicks, 0) > 0) {
      let valAtStart = 0;
      for (let i = ticks.length - 1; i >= 0; i--) {
        const value = elementAt(values, i);
        if (elementAt(ticks, i) <= noteStart && value !== null) {
          valAtStart = isAbsolute ? value - note.noteNum : value;
          break;
        }
      }
      relTicks.unshift(0);
      relValues.unshift(valAtStart);
    }

    const last = elementAt(relTicks, relTicks.length - 1);
    if (last < note.length) {
      relTicks.push(note.length);
      relValues.push(elementAt(relValues, relValues.length - 1));
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

type ParseFn = (data: Uint8Array | File, params?: { pitch?: boolean }) => Promise<UfData>;

let parsers: Readonly<Record<string, ParseFn>> | undefined;

async function lazyInit(): Promise<void> {
  if (parsers) return;
  const m = await import("@sevenc-nanashi/utaformatix-ts/base");
  parsers = { ...m.parseFunctions, midi: m.parseStandardMid };
}

function extFromFile(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return name.toLowerCase();
  return name.slice(dot + 1).toLowerCase();
}

/** Parse a supported singing-project file; propagate format and conversion errors. */
export async function importScoreFromFile(file: File, options: ImportOptions = {}): Promise<Score> {
  return ufDataToScore(await parseUfData(file, file.name, options.pitch ?? true), options);
}

/** Parse bytes using the filename extension; propagate format and conversion errors. */
export async function importScoreFromBytes(buf: Uint8Array, filename: string, options: ImportOptions = {}): Promise<Score> {
  return ufDataToScore(await parseUfData(buf, filename, options.pitch ?? true), options);
}

/** Parse all tracks using the filename extension; propagate unsupported format and converter errors. */
export async function parseUfData(input: File | Uint8Array, filename: string, pitch = true): Promise<UfData> {
  const ext = extFromFile(filename);
  await lazyInit();
  const parseFn = parsers?.[ext];
  if (!parseFn) throw new Error(`Unsupported file format: .${ext}`);
  return parseFn(input, { pitch });
}
