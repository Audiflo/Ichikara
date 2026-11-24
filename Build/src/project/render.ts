import type { AudioChunk, Note, VoiceConfig } from "../core/types";
import { elementAt, integerInRange } from "../core/validation";
import { streamScore } from "../synth/stream";
import { scaleVoice } from "../voices";
import { validateProject } from "./validation";
import type { Project, VocalTrack } from "./types";

const DEFAULT_SAMPLE_RATE = 44100;

/** Raw streams keep tracks separate and tag chunks with their initial mixer state. */
export interface StreamProjectOptions {
  applyMix?: boolean;
  voiceForTrack?: (track: VocalTrack, note: Note, startSample: number) => VoiceConfig | undefined;
}

function applyMix(chunk: AudioChunk, track: VocalTrack): AudioChunk {
  const mono = elementAt(chunk.data, 0);
  const angle = ((track.pan + 1) / 2) * (Math.PI / 2);
  const left = track.pan === 1 ? 0 : Math.cos(angle) * track.gain;
  const right = track.pan === -1 ? 0 : Math.sin(angle) * track.gain;
  return { ...chunk, channels: 2, data: [mono.map((value) => value * left), mono.map((value) => value * right)] };
}

function tagForLiveMix(chunk: AudioChunk, track: VocalTrack): AudioChunk {
  return {
    ...chunk,
    trackId: track.id,
    trackVolume: track.gain,
    trackPan: track.pan,
    trackMute: track.mute,
    trackSolo: track.solo,
  };
}

/** Stream a whole song in absolute sample order. Mixed streams bake solo, mute,
 *  gain and pan into the audio; raw streams keep tracks separate for live mixing.
 *  Holds one lookahead chunk per track; iterator closure releases every producer.
 *  Invalid documents, unsupported languages, and synthesis failures propagate to the consumer.
 */
export async function* streamProject(
  project: Project,
  sampleRate = DEFAULT_SAMPLE_RATE,
  options: StreamProjectOptions = {},
): AsyncGenerator<AudioChunk> {
  validateProject(project);
  integerInRange(sampleRate, "sample rate", 8000, 192000);
  const raw = options.applyMix === false;
  const voiceForTrack = options.voiceForTrack;
  const solo = project.tracks.some((track) => track.solo);
  const activeTracks = raw ? project.tracks : project.tracks.filter((track) => !track.mute && (!solo || track.solo));
  const producers = activeTracks.flatMap((track) => {
    const notes = track.parts.flatMap((part) => part.notes.map((note) => ({ ...note, tick: part.tick + note.tick })));
    if (notes.length === 0) return [];
    const voice = { ...scaleVoice(track.voice, track.parameters), sampleRate, channels: 1 as const };
    return [
      {
        track,
        stream: streamScore(
          {
            resolution: project.resolution,
            tempos: project.tempos,
            notes,
          },
          voice,
          track.language,
          {
            ...(voiceForTrack
              ? { voiceForNote: (note: Note, startSample: number) => voiceForTrack(track, note, startSample) ?? voice }
              : {}),
          },
        ),
      },
    ];
  });
  try {
    const heads: IteratorResult<AudioChunk>[] = [];
    for (const producer of producers) heads.push(await producer.stream.next());
    while (true) {
      let earliest = -1;
      let earliestSample = Infinity;
      for (const [index, head] of heads.entries()) {
        if (!head.done && head.value.startSample < earliestSample) {
          earliest = index;
          earliestSample = head.value.startSample;
        }
      }
      if (earliest < 0) return;
      const head = elementAt(heads, earliest);
      const producer = elementAt(producers, earliest);
      if (head.done) throw new Error("The selected render head must contain audio");
      yield raw ? tagForLiveMix(head.value, producer.track) : applyMix(head.value, producer.track);
      heads[earliest] = await producer.stream.next();
    }
  } finally {
    await Promise.all(producers.map((producer) => producer.stream.return(undefined)));
  }
}
