import type { AudioChunk } from "../core/types";
import { elementAt, integerInRange } from "../core/validation";
import { streamScore } from "../synth/stream";
import { scaleVoice } from "../voices";
import { validateProject } from "./validation";
import type { Project, VocalTrack } from "./types";

const DEFAULT_SAMPLE_RATE = 44100;

function applyMix(chunk: AudioChunk, track: VocalTrack): AudioChunk {
  const mono = elementAt(chunk.data, 0);
  const angle = ((track.pan + 1) / 2) * (Math.PI / 2);
  const left = track.pan === 1 ? 0 : Math.cos(angle) * track.gain;
  const right = track.pan === -1 ? 0 : Math.sin(angle) * track.gain;
  return { ...chunk, channels: 2, data: [mono.map((value) => value * left), mono.map((value) => value * right)] };
}

/** Stream a whole song in absolute sample order, honoring part placement, solo, mute, gain and pan.
 * Holds one lookahead chunk per part; iterator closure releases every region producer.
 * Invalid documents, unsupported languages, and synthesis failures propagate to the consumer.
 */
export async function* streamProject(project: Project, sampleRate = DEFAULT_SAMPLE_RATE): AsyncGenerator<AudioChunk> {
  validateProject(project);
  integerInRange(sampleRate, "sample rate", 8000, 192000);
  const solo = project.tracks.some((track) => track.solo);
  const producers = project.tracks
    .filter((track) => !track.mute && (!solo || track.solo))
    .flatMap((track) => {
      const voice = { ...scaleVoice(track.voice, track.parameters), sampleRate, channels: 1 as const };
      return track.parts
        .filter((part) => part.notes.length > 0)
        .map((part) => ({
          track,
          stream: streamScore(
            {
              resolution: project.resolution,
              tempos: project.tempos,
              notes: part.notes.map((note) => ({ ...note, tick: part.tick + note.tick })),
            },
            voice,
            track.language,
          ),
        }));
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
      yield applyMix(head.value, producer.track);
      heads[earliest] = await producer.stream.next();
    }
  } finally {
    await Promise.all(producers.map((producer) => producer.stream.return(undefined)));
  }
}
