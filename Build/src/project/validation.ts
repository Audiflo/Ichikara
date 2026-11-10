import { finiteInRange, integerInRange } from "../core/validation";
import type { Project } from "./types";

type ObjectValue = Record<string, unknown>;
const MAX_MIDI_NOTE = 127;
const MAX_SAMPLE_RATE = 192000;
const MAX_TICK = Number.MAX_SAFE_INTEGER;

function object(value: unknown, path: string): ObjectValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  return value as ObjectValue;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value;
}

function text(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()))
    throw new TypeError(`${path} must be a string${allowEmpty ? "" : " with content"}`);
  return value;
}

function number(value: unknown, path: string, min: number, max = Number.MAX_VALUE, integer = false): number {
  if (typeof value !== "number") throw new TypeError(`${path} must be a number`);
  return integer ? integerInRange(value, path, min, max) : finiteInRange(value, path, min, max);
}

function optionalNumber(value: ObjectValue, key: string, path: string, min: number, max = Number.MAX_VALUE): void {
  if (Object.hasOwn(value, key)) number(value[key], `${path}.${key}`, min, max);
}

function validateVoice(value: unknown): void {
  const voice = object(value, "voice");
  text(voice["name"], "voice.name");
  number(voice["sampleRate"], "voice.sampleRate", 8000, MAX_SAMPLE_RATE, true);
  number(voice["channels"], "voice.channels", 1, 2, true);
  optionalNumber(voice, "volume", "voice", 0);
  optionalNumber(voice, "peakComp", "voice", 0, 100);
  optionalNumber(voice, "normalizeTarget", "voice", 0, 1);
  const glottal = object(voice["glottal"], "voice.glottal");
  number(glottal["openQuotient"], "voice.glottal.openQuotient", Number.EPSILON, 1 - Number.EPSILON);
  number(glottal["speedQuotient"], "voice.glottal.speedQuotient", Number.EPSILON);
  for (const key of ["tenseness", "aspiration"]) number(glottal[key], `voice.glottal.${key}`, 0, 1);
  number(glottal["power"], "voice.glottal.power", 0);
  for (const key of ["jitter", "shimmer"]) optionalNumber(glottal, key, "voice.glottal", 0, 1);
  const formant = object(voice["formant"], "voice.formant");
  for (const key of ["scale", "bandwidth"]) number(formant[key], `voice.formant.${key}`, Number.EPSILON);
  number(formant["shift"], "voice.formant.shift", -MAX_MIDI_NOTE, MAX_MIDI_NOTE);
  const vibrato = object(voice["vibrato"], "voice.vibrato");
  for (const key of ["rate", "depth", "attack"]) number(vibrato[key], `voice.vibrato.${key}`, 0);
}

function validateNote(value: unknown, partLength: number, identity: (value: unknown) => void): void {
  const note = object(value, "note");
  identity(note["id"]);
  text(note["lyric"], "note.lyric", true);
  const tick = number(note["tick"], "note.tick", 0, MAX_TICK, true);
  const length = number(note["length"], "note.length", 1, MAX_TICK, true);
  if (!Number.isSafeInteger(tick + length) || tick + length > partLength) throw new RangeError("Note extends beyond its part");
  number(note["noteNum"], "note.noteNum", 0, MAX_MIDI_NOTE, true);
  optionalNumber(note, "velocity", "note", 0, MAX_MIDI_NOTE);
  optionalNumber(note, "intensity", "note", 0, 200);
  optionalNumber(note, "modulation", "note", 0, 100);
  optionalNumber(note, "pitchAccent", "note", -MAX_MIDI_NOTE, MAX_MIDI_NOTE);
  if (Object.hasOwn(note, "phonemes")) {
    for (const symbol of array(note["phonemes"], "note.phonemes")) text(symbol, "phoneme");
  }
  if (Object.hasOwn(note, "vibratoOverride")) {
    const vibrato = object(note["vibratoOverride"], "note.vibratoOverride");
    for (const key of ["rate", "depth", "attack"]) optionalNumber(vibrato, key, "note.vibratoOverride", 0);
  }
  if (Object.hasOwn(note, "pitchBend")) {
    const pitch = object(note["pitchBend"], "note.pitchBend");
    const ticks = array(pitch["ticks"], "pitch ticks");
    const values = array(pitch["values"], "pitch values");
    if (ticks.length !== values.length) throw new RangeError("Pitch ticks and values must have equal lengths");
    let previous = -1;
    for (const [index, coordinate] of ticks.entries()) {
      const point = number(coordinate, "pitch tick", 0, length);
      if (point <= previous) throw new RangeError("Pitch ticks must be strictly increasing");
      previous = point;
      number(values[index], "pitch value", -MAX_MIDI_NOTE, MAX_MIDI_NOTE);
    }
  }
}

/** Validate every native document field before use or serialization.
 * Throws TypeError/RangeError with field context. Duplicate identities and unsupported versions are rejected.
 */
export function validateProject(value: unknown): asserts value is Project {
  const project = object(value, "project");
  if (project["format"] !== "ichikara" || project["version"] !== 1) throw new TypeError("Unsupported Ichikara project format or version");
  const seen = new Set<string>();
  const identity = (value: unknown): void => {
    const id = text(value, "id");
    if (seen.has(id)) throw new TypeError(`Duplicate id: ${id}`);
    seen.add(id);
  };
  identity(project["id"]);
  text(project["name"], "project.name", true);
  number(project["resolution"], "resolution", 1, MAX_TICK, true);
  for (const key of ["tempos", "meters"]) {
    const events = array(project[key], key);
    if (!events.length) throw new TypeError(`${key} must include an event at tick zero`);
    let previous = -1;
    for (const [index, value] of events.entries()) {
      const event = object(value, key);
      const tick = number(event["tick"], `${key}.tick`, 0, MAX_TICK, true);
      if ((index === 0 && tick !== 0) || tick <= previous) throw new RangeError(`${key} must start at zero and increase strictly`);
      previous = tick;
      if (key === "tempos") number(event["tempo"], "tempo", Number.EPSILON);
      else {
        number(event["numerator"], "meter numerator", 1, 64, true);
        const denominator = number(event["denominator"], "meter denominator", 1, 64, true);
        if (!Number.isInteger(Math.log2(denominator))) throw new RangeError("Meter denominator must be a power of two");
      }
    }
  }
  for (const value of array(project["tracks"], "tracks")) {
    const track = object(value, "track");
    identity(track["id"]);
    text(track["name"], "track.name", true);
    text(track["language"], "track.language");
    validateVoice(track["voice"]);
    const params = object(track["parameters"], "track.parameters");
    optionalNumber(params, "gender", "track.parameters", -1, 1);
    for (const key of ["breathiness", "tension", "brightness", "vibratoAmount", "oq", "shimmer"])
      optionalNumber(params, key, "track.parameters", 0, 1);
    optionalNumber(params, "sq", "track.parameters", Number.EPSILON);
    optionalNumber(params, "fScale", "track.parameters", Number.EPSILON);
    optionalNumber(params, "fShift", "track.parameters", -MAX_MIDI_NOTE, MAX_MIDI_NOTE);
    for (const key of ["vRate", "vAttack"]) optionalNumber(params, key, "track.parameters", 0);
    number(track["gain"], "track.gain", 0, 2);
    number(track["pan"], "track.pan", -1, 1);
    for (const key of ["mute", "solo"]) if (typeof track[key] !== "boolean") throw new TypeError(`track.${key} must be boolean`);
    for (const value of array(track["parts"], "parts")) {
      const part = object(value, "part");
      identity(part["id"]);
      text(part["name"], "part.name", true);
      const tick = number(part["tick"], "part.tick", 0, MAX_TICK, true);
      const length = number(part["length"], "part.length", 1, MAX_TICK, true);
      integerInRange(tick + length, "part end", 1);
      for (const note of array(part["notes"], "notes")) validateNote(note, length, identity);
    }
  }
}
