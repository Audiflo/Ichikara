import type { AudioChunk } from "./types";
import { elementAt, integerInRange } from "./validation";

/** Validate channel layout and timeline metadata; return the frame count or throw RangeError. */
export function validateAudioChunk(chunk: AudioChunk): number {
  integerInRange(chunk.sampleRate, "sampleRate", 1);
  integerInRange(chunk.startSample, "startSample", 0);
  integerInRange(chunk.channels, "channels", 1, 2);
  if (chunk.data.length !== chunk.channels) throw new RangeError("Audio channel count does not match its data");
  const length = elementAt(chunk.data, 0).length;
  for (const channel of chunk.data) {
    if (channel.length !== length) throw new RangeError("Audio channels must have equal lengths");
  }
  integerInRange(chunk.startSample + length, "chunk end", 0);
  return length;
}

/** Mix compatible chunks on their absolute sample timeline; reject invalid layouts or rates. */
export function mixAudioChunks(chunks: readonly AudioChunk[], emptyChannels = 2): AudioChunk {
  const first = chunks[0];
  const sampleRate = first?.sampleRate ?? 44100;
  const channels = first?.channels ?? emptyChannels;
  integerInRange(channels, "channels", 1, 2);
  let totalLength = 0;
  for (const chunk of chunks) {
    const length = validateAudioChunk(chunk);
    if (chunk.sampleRate !== sampleRate || chunk.channels !== channels) {
      throw new RangeError("Mixed audio chunks must have the same sample rate and channel count");
    }
    totalLength = Math.max(totalLength, chunk.startSample + length);
  }
  const data = Array.from({ length: channels }, () => new Float32Array(totalLength));
  for (const chunk of chunks) {
    for (const [channelIndex, source] of chunk.data.entries()) {
      const target = elementAt(data, channelIndex);
      for (const [index, sample] of source.entries()) {
        if (!Number.isFinite(sample)) throw new RangeError("Audio contains a non-finite sample");
        const offset = chunk.startSample + index;
        target[offset] = elementAt(target, offset) + sample;
      }
    }
  }
  return { data, sampleRate, startSample: 0, channels };
}
