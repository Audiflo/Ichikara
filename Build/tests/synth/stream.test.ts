import { streamScore, renderScore, mixChunks } from "../../src/synth/stream";
import type { Score, AudioChunk } from "../../src/core/types";
import { buildVoice } from "../../src/voices/index";
import { elementAt } from "../../src/core/validation";

describe("mixChunks", () => {
  it("mixes multiple chunks into one", () => {
    const chunks = [
      { data: [new Float32Array(100)], sampleRate: 44100, startSample: 0, channels: 1 },
      { data: [new Float32Array(100)], sampleRate: 44100, startSample: 100, channels: 1 },
    ];
    const mixed = mixChunks(chunks);
    expect(mixed.data.length).toBe(1);
    expect(elementAt(mixed.data, 0).length).toBe(200);
    expect(mixed.sampleRate).toBe(44100);
  });

  it("returns empty chunk for empty input", () => {
    const mixed = mixChunks([]);
    expect(elementAt(mixed.data, 0).length).toBe(0);
  });

  it("handles overlapping chunks", () => {
    const chunks = [
      { data: [new Float32Array(100).fill(0.5)], sampleRate: 44100, startSample: 0, channels: 1 },
      { data: [new Float32Array(100).fill(0.3)], sampleRate: 44100, startSample: 50, channels: 1 },
    ];
    const mixed = mixChunks(chunks);
    const channel = elementAt(mixed.data, 0);
    expect(channel[0]).toBeCloseTo(0.5, 5);
    expect(channel[50]).toBeCloseTo(0.8, 5);
    expect(channel[99]).toBeCloseTo(0.8, 5);
    expect(channel[149]).toBeCloseTo(0.3, 5);
  });
});

describe("renderScore", () => {
  const voice = buildVoice();

  it("uses the registered default voice when no voice is supplied", async () => {
    const chunks = await renderScore({
      tempos: [{ tick: 0, tempo: 120 }],
      resolution: 480,
      notes: [{ lyric: "a", noteNum: 60, length: 48 }],
    });
    expect(chunks).toHaveLength(1);
  });

  it("preserves a gap after a legato pair on the absolute timeline", async () => {
    const chunks = await renderScore(
      {
        tempos: [{ tick: 0, tempo: 120 }],
        resolution: 480,
        notes: [
          { tick: 0, lyric: "a", noteNum: 60, length: 48 },
          { tick: 48, lyric: "a", noteNum: 60, length: 48 },
          { tick: 144, lyric: "a", noteNum: 60, length: 48 },
        ],
      },
      voice,
      "jp",
    );
    expect(chunks.map((chunk) => chunk.startSample)).toEqual([0, 1984, 6615]);
  });

  it("renders a simple score without error", async () => {
    const score: Score = {
      tempos: [{ tick: 0, tempo: 120 }],
      resolution: 480,
      notes: [{ tick: 0, lyric: "ka", noteNum: 72, length: 480 }],
    };
    const chunks = await renderScore(score, voice, "jp");
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      for (const ch of chunk.data) {
        for (const s of ch) {
          expect(isFinite(s)).toBe(true);
          expect(isNaN(s)).toBe(false);
        }
      }
    }
  });

  it("renders multiple notes respecting ticks", async () => {
    const score: Score = {
      tempos: [{ tick: 0, tempo: 120 }],
      resolution: 480,
      notes: [
        { tick: 0, lyric: "ka", noteNum: 72, length: 480 },
        { tick: 480, lyric: "na", noteNum: 76, length: 480 },
      ],
    };
    const chunks = await renderScore(score, voice, "jp");
    expect(chunks.length).toBe(2);
    const first = elementAt(chunks, 0);
    const second = elementAt(chunks, 1);
    expect(second.startSample).toBeLessThan(first.startSample + elementAt(first.data, 0).length);
    expect(second.startSample).toBeGreaterThan(first.startSample);
  });

  it("handles voice lookup by name", async () => {
    const score: Score = {
      tempos: [{ tick: 0, tempo: 120 }],
      resolution: 480,
      notes: [{ tick: 0, lyric: "a", noteNum: 72, length: 480 }],
    };
    const chunks = await renderScore(score, "chitose chika", "jp");
    expect(chunks.length).toBe(1);
  });
});

describe("streamScore", () => {
  it("integrates tempo changes inside a gap and a sustained note", async () => {
    const voice = { ...buildVoice(), sampleRate: 8000 };
    const chunks = await renderScore(
      {
        resolution: 480,
        tempos: [
          { tick: 0, tempo: 120 },
          { tick: 480, tempo: 60 },
          { tick: 960, tempo: 240 },
        ],
        notes: [{ tick: 720, lyric: "a", noteNum: 60, length: 720 }],
      },
      voice,
      "jp",
    );
    const chunk = elementAt(chunks, 0);
    expect(chunk.startSample).toBe(8000);
    expect(elementAt(chunk.data, 0).length).toBe(6000);
  });

  it("renders out-of-order and overlapping notes at their absolute starts", async () => {
    const chunks = await renderScore(
      {
        resolution: 480,
        tempos: [{ tick: 0, tempo: 120 }],
        notes: [
          { tick: 480, lyric: "a", noteNum: 60, length: 480 },
          { tick: 0, lyric: "a", noteNum: 64, length: 960 },
          { tick: 240, lyric: "a", noteNum: 67, length: 120 },
        ],
      },
      { ...buildVoice(), sampleRate: 8000 },
      "jp",
    );
    expect(chunks.map((chunk) => chunk.startSample)).toEqual([0, 2000, 4000]);
  });

  it("yields chunks as an async generator", async () => {
    const score: Score = {
      tempos: [{ tick: 0, tempo: 120 }],
      resolution: 480,
      notes: [{ tick: 0, lyric: "a", noteNum: 72, length: 480 }],
    };
    const voice = buildVoice();
    const chunks: AudioChunk[] = [];
    for await (const chunk of streamScore(score, voice, "jp")) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBe(1);
  });
});

describe("cross-note overlap timing", () => {
  const voice = buildVoice();
  const SAMPLES_PER_NOTE = 22050;

  function legatoScore(count: number): Score {
    return {
      tempos: [{ tick: 0, tempo: 120 }],
      resolution: 480,
      notes: Array.from({ length: count }, (_, i) => ({
        tick: i * 480,
        lyric: i % 2 === 0 ? "ka" : "na",
        noteNum: 60 + (i % 7),
        length: 480,
      })),
    };
  }

  for (const count of [1, 2, 12, 50]) {
    it(`keeps the mixed span exact for ${count} legato notes`, async () => {
      const chunks: AudioChunk[] = [];
      for await (const c of streamScore(legatoScore(count), voice, "jp")) chunks.push(c);
      const mixed = mixChunks(chunks);
      expect(elementAt(mixed.data, 0).length).toBe(count * SAMPLES_PER_NOTE);
    }, 60_000);
  }

  it("does not grow the overlap tail with tick quantisation", async () => {
    const chunks: AudioChunk[] = [];
    for await (const c of streamScore(legatoScore(2), voice, "jp")) chunks.push(c);
    const first = elementAt(chunks, 0);
    const second = elementAt(chunks, 1);
    const overlap = first.startSample + elementAt(first.data, 0).length - second.startSample;
    expect(overlap).toBe(Math.round(0.005 * voice.sampleRate));
    expect(elementAt(second.data, 0).length).toBe(SAMPLES_PER_NOTE + overlap);
  });
});
