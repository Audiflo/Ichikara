import type { Note, TempoEvent, VoiceConfig } from "../core/types";
import type { scaleVoice } from "../voices";

/** Host-supplied identity source; IDs must be unique within a document. */
export type IdFactory = () => string;

/** Per-track OneVoice controls, applied to the stored base voice during rendering. */
export type VoiceParameters = Parameters<typeof scaleVoice>[1];

/** A note with stable identity and a tick position relative to its owning part. */
export interface ProjectNote extends Note {
  id: string;
  tick: number;
}

/** A vocal region on a track. Length and position use the project's resolution. */
export interface VocalPart {
  id: string;
  name: string;
  tick: number;
  length: number;
  notes: ProjectNote[];
}

/** A vocal track with independent language, voice, mix controls, and parts. */
export interface VocalTrack {
  id: string;
  name: string;
  language: string;
  voice: VoiceConfig;
  parameters: VoiceParameters;
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  parts: VocalPart[];
}

/** A time signature effective at its absolute tick. Denominator is a power of two. */
export interface MeterEvent {
  tick: number;
  numerator: number;
  denominator: number;
}

/** Versioned, host-independent native song document. No UI or playback resources are stored. */
export interface Project {
  format: "ichikara";
  version: 1;
  id: string;
  name: string;
  resolution: number;
  tempos: TempoEvent[];
  meters: MeterEvent[];
  tracks: VocalTrack[];
}
