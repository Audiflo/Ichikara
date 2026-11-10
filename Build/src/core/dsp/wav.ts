import type { AudioChunk } from "../types";
import { mixAudioChunks } from "../audio";
import { elementAt, finiteInRange, integerInRange } from "../validation";

const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;
const MAX_RIFF_SIZE = 0xffffffff;

/** Encode compatible chunks as interleaved 16-bit PCM WAV; reject invalid audio or oversized RIFF data. */
export function encodeWav(chunks: AudioChunk[], gain = 1): ArrayBuffer {
  finiteInRange(gain, "gain", 0);
  const mixed = mixAudioChunks(chunks, 1);
  const { sampleRate, channels, data } = mixed;
  const frames = elementAt(data, 0).length;
  const dataBytes = frames * channels * BYTES_PER_SAMPLE;
  integerInRange(dataBytes + HEADER_BYTES - 8, "RIFF size", 0, MAX_RIFF_SIZE);
  integerInRange(sampleRate * channels * BYTES_PER_SAMPLE, "WAV byte rate", 1, MAX_RIFF_SIZE);
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  function writeStr(offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * BYTES_PER_SAMPLE, true);
  view.setUint16(32, channels * BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = HEADER_BYTES;
  for (let i = 0; i < frames; i++) {
    for (const channel of data) {
      const sample = Math.max(-1, Math.min(1, elementAt(channel, i) * gain));
      view.setInt16(offset, Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)), true);
      offset += BYTES_PER_SAMPLE;
    }
  }
  return buffer;
}
