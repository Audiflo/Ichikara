import type { Score, VoiceConfig } from "../core/types";
import { chitoseChika, getVoice } from "../voices";
import { integerInRange } from "../core/validation";
import { validateProject } from "./validation";
import type { IdFactory, Project, VocalPart, VocalTrack } from "./types";

const DEFAULT_RESOLUTION = 480;
const DEFAULT_TEMPO = 120;
const DEFAULT_BEATS_PER_BAR = 4;

/** Create an empty native song with 4/4 meter and 120 BPM. IDs are supplied by the host. */
export function createProject(name: string, id: IdFactory): Project {
  return {
    format: "ichikara",
    version: 1,
    id: id(),
    name,
    resolution: DEFAULT_RESOLUTION,
    tempos: [{ tick: 0, tempo: DEFAULT_TEMPO }],
    meters: [{ tick: 0, numerator: 4, denominator: 4 }],
    tracks: [],
  };
}

/** Append and return an independent vocal track. The supplied voice is cloned. */
export function addTrack(project: Project, name: string, voice: VoiceConfig, language: string, id: IdFactory): VocalTrack {
  const track: VocalTrack = {
    id: id(),
    name,
    voice: structuredClone(voice),
    language,
    parameters: {},
    gain: 1,
    pan: 0,
    mute: false,
    solo: false,
    parts: [],
  };
  project.tracks.push(track);
  return track;
}

/** Append and return an empty vocal region; invalid timeline coordinates throw RangeError. */
export function addPart(track: VocalTrack, name: string, tick: number, length: number, id: IdFactory): VocalPart {
  integerInRange(tick, "part tick", 0);
  integerInRange(length, "part length", 1);
  integerInRange(tick + length, "part end", 1);
  const part: VocalPart = { id: id(), name, tick, length, notes: [] };
  track.parts.push(part);
  return part;
}

/** Import a single score into a native track, materializing implicit note ticks and stable IDs.
 * Preserves resolution and expression. Unknown voice names fall back to Chitose Chika.
 */
export function projectFromScore(score: Score, name: string, language: string, id: IdFactory): Project {
  const project = createProject(name, id);
  project.resolution = score.resolution;
  project.tempos = structuredClone(score.tempos).sort((a, b) => a.tick - b.tick);
  if (project.tempos[0]?.tick !== 0) project.tempos.unshift({ tick: 0, tempo: DEFAULT_TEMPO });
  const track = addTrack(project, "Vocal 1", getVoice(score.voice ?? chitoseChika.name) ?? chitoseChika, language, id);
  let nextTick = 0;
  const notes = score.notes.map((source) => {
    const note = { ...structuredClone(source), id: id(), tick: source.tick ?? nextTick };
    nextTick = note.tick + note.length;
    return note;
  });
  const end = notes.reduce((end, note) => Math.max(end, note.tick + note.length), score.resolution * DEFAULT_BEATS_PER_BAR);
  const part = addPart(track, name || "Vocal part", 0, end, id);
  part.notes = notes;
  validateProject(project);
  return project;
}

/** Parse a native JSON document, rejecting malformed fields and unsupported versions. */
export function parseProject(source: string): Project {
  const value: unknown = JSON.parse(source);
  validateProject(value);
  return value;
}

/** Validate and serialize a complete native document without dropping expression or mix settings. */
export function serializeProject(project: Project): string {
  validateProject(project);
  return JSON.stringify(project, null, 2) + "\n";
}
