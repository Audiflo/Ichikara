import { StreamPlayer, type PlayerEvent } from "../../src/player/stream-player";
import type { AudioChunk } from "../../src/core/types";
import { streamScore, mixChunks } from "../../src/synth/stream";
import { buildVoice } from "../../src/voices/index";
import type { Score } from "../../src/core/types";
import { elementAt } from "../../src/core/validation";

class MockAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly channels: Float32Array[];

  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new RangeError(`channel ${channel} out of range`);
    return data;
  }
}

interface RecordedSource {
  buffer: MockAudioBuffer | null;
  start: (when: number, offset: number, duration: number) => void;
}

class MockAudioContext {
  state: AudioContextState = "running";
  readonly destination = {};
  readonly createdBuffers: MockAudioBuffer[] = [];
  readonly createdSources: RecordedSource[] = [];
  private clock = 0;

  constructor(readonly options?: { sampleRate?: number }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastContext = this;
  }

  get currentTime(): number {
    return this.clock;
  }

  createBuffer(channels: number, length: number, sampleRate: number): MockAudioBuffer {
    const buf = new MockAudioBuffer(channels, length, sampleRate);
    this.createdBuffers.push(buf);
    return buf;
  }

  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
      },
      connect() {},
    };
  }

  createBufferSource() {
    const record: RecordedSource = { buffer: null, start: () => {} };
    this.createdSources.push(record);
    return {
      get buffer() {
        return record.buffer;
      },
      set buffer(value: MockAudioBuffer | null) {
        record.buffer = value;
      },
      onended: null,
      connect() {},
      start: (when: number, offset: number, duration: number) => {
        record.start(when, offset, duration);
        setTimeout(() => {
          if (this.state === "running") this.clock = Math.max(this.clock, when + duration);
        }, 0);
      },
      stop() {},
    };
  }

  async resume(): Promise<void> {
    this.state = "running";
  }

  async suspend(): Promise<void> {
    this.state = "suspended";
  }

  async close(): Promise<void> {
    this.state = "closed";
  }
}

const realAudioContext = globalThis.AudioContext;

let lastContext: MockAudioContext | null = null;

function installMockAudioContext(): void {
  lastContext = null;
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, writable: true, value: MockAudioContext });
}

function installedContext(): MockAudioContext {
  if (!lastContext) throw new Error("player never constructed an AudioContext");
  return lastContext;
}

afterEach(() => {
  globalThis.AudioContext = realAudioContext;
});

function chunk(startSample: number, length: number, value: number, channels = 1): AudioChunk {
  const data = Array.from({ length: channels }, () => new Float32Array(length).fill(value));
  return { data, sampleRate: 44100, startSample, channels };
}

function legatoChunks(count: number, nominal: number, overlap: number, value: number, channels = 1): AudioChunk[] {
  const chunks: AudioChunk[] = [];
  let end = 0;
  for (let i = 0; i < count; i++) {
    const isFirst = i === 0;
    const start = isFirst ? 0 : end - overlap;
    const length = nominal + (isFirst ? 0 : overlap);
    chunks.push(chunk(start, length, value, channels));
    end = start + length;
  }
  return chunks;
}

async function waitForState(events: PlayerEvent[], state: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!events.some((e) => e.type === "stateChange" && e.state === state)) {
    if (Date.now() > deadline) throw new Error(`player never reached state ${state}`);
    await new Promise((res) => setTimeout(res, 5));
  }
}

async function waitForEvent(events: PlayerEvent[], predicate: (e: PlayerEvent) => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!events.some(predicate)) {
    if (Date.now() > deadline) throw new Error(`player never emitted ${what}`);
    await new Promise((res) => setTimeout(res, 5));
  }
}

function lastState(events: PlayerEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = elementAt(events, i);
    if (e.type === "stateChange") return e.state;
  }
  return undefined;
}

async function* toStream(chunks: AudioChunk[]): AsyncGenerator<AudioChunk> {
  for (const c of chunks) yield c;
}

async function* endlessStream(): AsyncGenerator<AudioChunk> {
  for (let i = 0; ; i++) {
    await new Promise((res) => setTimeout(res, 0));
    yield chunk(i * 4410, 4410, 0.5);
  }
}

async function playChunks(chunks: AudioChunk[], events: PlayerEvent[] = []): Promise<MockAudioContext> {
  installMockAudioContext();
  const player = new StreamPlayer();
  player.on((e) => events.push(e));
  await player.play(toStream(chunks), 0.8, 44100, { preBufferThreshold: 1.0 });
  return installedContext();
}

function lastProgress(events: PlayerEvent[]): number {
  const progress = events.filter((e): e is Extract<PlayerEvent, { type: "progress" }> => e.type === "progress");
  expect(progress.length).toBeGreaterThan(0);
  return elementAt(progress, progress.length - 1).renderedSamples;
}

describe("StreamPlayer chunk placement", () => {
  const NOMINAL = 100;
  const OVERLAP = 90;

  it("places overlapping chunks on the absolute timeline instead of appending", async () => {
    const ctx = await playChunks(legatoChunks(2, NOMINAL, OVERLAP, 0.5));

    expect(ctx.createdBuffers).toHaveLength(1);
    const buf = elementAt(ctx.createdBuffers, 0);
    expect(buf.length).toBe(2 * NOMINAL);

    const data = buf.getChannelData(0);
    expect(data[0]).toBeCloseTo(0.5, 6);
    expect(data[9]).toBeCloseTo(0.5, 6);
    expect(data[10]).toBeCloseTo(1.0, 6);
    expect(data[99]).toBeCloseTo(1.0, 6);
    expect(data[100]).toBeCloseTo(0.5, 6);
    expect(data[199]).toBeCloseTo(0.5, 6);
  });

  it("reports the scheduled extent, not the sum of chunk lengths", async () => {
    const events: PlayerEvent[] = [];
    await playChunks(legatoChunks(2, NOMINAL, OVERLAP, 0.5), events);
    expect(lastProgress(events)).toBe(2 * NOMINAL);
  });

  it("does not accumulate drift across many legato chunks", async () => {
    const events: PlayerEvent[] = [];
    const ctx = await playChunks(legatoChunks(20, NOMINAL, OVERLAP, 0.1), events);

    expect(ctx.createdBuffers).toHaveLength(1);
    expect(elementAt(ctx.createdBuffers, 0).length).toBe(20 * NOMINAL);
    expect(lastProgress(events)).toBe(20 * NOMINAL);
  });
});

describe("StreamPlayer channel handling", () => {
  it("creates one multichannel buffer and one source per batch", async () => {
    const ctx = await playChunks(legatoChunks(2, 100, 90, 0.5, 2));

    expect(ctx.createdBuffers).toHaveLength(1);
    expect(elementAt(ctx.createdBuffers, 0).numberOfChannels).toBe(2);
    expect(ctx.createdSources).toHaveLength(1);
  });

  it("preserves distinct channel content in a single buffer", async () => {
    const stereo: AudioChunk = {
      data: [new Float32Array(100).fill(0.1), new Float32Array(100).fill(0.9)],
      sampleRate: 44100,
      startSample: 0,
      channels: 2,
    };
    const ctx = await playChunks([stereo]);
    const buf = elementAt(ctx.createdBuffers, 0);
    expect(buf.getChannelData(0)[0]).toBeCloseTo(0.1, 6);
    expect(buf.getChannelData(1)[0]).toBeCloseTo(0.9, 6);
  });
});

describe("StreamPlayer timeline parity with export", () => {
  it("schedules the same total extent as mixChunks for legato notes", async () => {
    const voice = buildVoice();
    const notes = Array.from({ length: 12 }, (_, i) => ({
      tick: i * 480,
      lyric: i % 2 === 0 ? "ka" : "na",
      noteNum: 60 + (i % 7),
      length: 480,
    }));
    const score: Score = { tempos: [{ tick: 0, tempo: 120 }], resolution: 480, notes };

    const chunks: AudioChunk[] = [];
    for await (const c of streamScore(score, voice, "jp")) chunks.push(c);
    const exported = mixChunks(chunks);

    const events: PlayerEvent[] = [];
    await playChunks(chunks, events);

    expect(lastProgress(events)).toBe(elementAt(exported.data, 0).length);
  }, 60_000);
});

describe("StreamPlayer resource handling", () => {
  it("reports position from the audio clock and keeps paused rendering from advancing it", async () => {
    jest.useFakeTimers();
    installMockAudioContext();
    let audioTime = 10;
    const clock = jest.spyOn(MockAudioContext.prototype, "currentTime", "get").mockImplementation(() => audioTime);
    const player = new StreamPlayer();
    const run = player.play(toStream([chunk(0, 441000, 0.5)]));
    try {
      await jest.advanceTimersByTimeAsync(0);
      expect(player.currentTime).toBe(0);
      audioTime = 12.05;
      expect(player.currentTime).toBeCloseTo(2);
      player.pause();
      await jest.advanceTimersByTimeAsync(2000);
      expect(player.currentTime).toBeCloseTo(2);
      player.resume();
      audioTime = 13.05;
      expect(player.currentTime).toBeCloseTo(3);
      player.stop();
      expect(player.currentTime).toBe(0);
    } finally {
      player.stop();
      await jest.advanceTimersByTimeAsync(100);
      await run;
      clock.mockRestore();
      jest.useRealTimers();
    }
  });

  it("skips elapsed samples instead of shifting a late chunk off the song timeline", async () => {
    jest.useFakeTimers();
    installMockAudioContext();
    let audioTime = 0;
    const clock = jest.spyOn(MockAudioContext.prototype, "currentTime", "get").mockImplementation(() => audioTime);
    const start = jest.fn();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = MockAudioContext.prototype.createBufferSource;
    const source = jest.spyOn(MockAudioContext.prototype, "createBufferSource").mockImplementation(function (this: MockAudioContext) {
      const result = original.call(this);
      result.start = start;
      return result;
    });
    const player = new StreamPlayer();
    async function* late(): AsyncGenerator<AudioChunk> {
      yield chunk(0, 44100, 0.5);
      audioTime = 1.5;
      yield chunk(44100, 44100, 0.5);
    }
    const run = player.play(late(), 0.8, 44100, { preBufferThreshold: 0.5 });
    try {
      await jest.advanceTimersByTimeAsync(0);
      expect(start).toHaveBeenLastCalledWith(1.51, expect.closeTo(0.46), expect.closeTo(0.54));
    } finally {
      player.stop();
      await jest.advanceTimersByTimeAsync(100);
      await run;
      source.mockRestore();
      clock.mockRestore();
      jest.useRealTimers();
    }
  });

  it("settles stop while waiting for scheduled audio to finish", async () => {
    jest.useFakeTimers();
    installMockAudioContext();
    const clock = jest.spyOn(MockAudioContext.prototype, "currentTime", "get").mockReturnValue(0);
    const player = new StreamPlayer();
    let settled = false;
    try {
      const observed = player.play(toStream([chunk(0, 4410, 0.5)])).then(() => {
        settled = true;
      });
      await jest.advanceTimersByTimeAsync(0);
      player.stop();
      await jest.advanceTimersByTimeAsync(100);
      expect(settled).toBe(true);
      expect(installedContext().state).toBe("closed");
      await observed;
    } finally {
      clock.mockRestore();
      jest.useRealTimers();
    }
  });

  it("stops during a pending source read without waiting for the source", async () => {
    jest.useFakeTimers();
    installMockAudioContext();
    const player = new StreamPlayer();
    let settled = false;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    async function* blocked(): AsyncGenerator<AudioChunk> {
      await gate;
      yield chunk(0, 4410, 0.5);
    }
    try {
      const observed = player.play(blocked()).then(() => {
        settled = true;
      });
      await jest.advanceTimersByTimeAsync(0);
      player.stop();
      await jest.advanceTimersByTimeAsync(100);
      expect(settled).toBe(true);
      expect(installedContext().state).toBe("closed");
      await observed;
    } finally {
      release?.();
      jest.useRealTimers();
    }
  });

  it("closes the AudioContext after playback completes", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    await player.play(toStream(legatoChunks(4, 4410, 220, 0.5)), 0.8, 44100, { preBufferThreshold: 0.01 });
    expect(installedContext().state).toBe("closed");
  });

  it("closes the AudioContext after the stream throws", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    const events: PlayerEvent[] = [];
    player.on((e) => events.push(e));
    async function* failing(): AsyncGenerator<AudioChunk> {
      yield chunk(0, 4410, 0.5);
      throw new Error("render failed");
    }
    await player.play(failing(), 0.8, 44100, { preBufferThreshold: 0.01 });
    expect(installedContext().state).toBe("closed");
    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("leaves the context to stop() when playback is aborted", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    const events: PlayerEvent[] = [];
    player.on((e) => events.push(e));
    async function* endless(): AsyncGenerator<AudioChunk> {
      for (let i = 0; i < 1000; i++) {
        yield chunk(i * 441, 4410, 0.5);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    const run = player.play(endless(), 0.8, 44100, { preBufferThreshold: 0.01 });
    await new Promise((r) => setTimeout(r, 5));
    player.stop();
    await run;
    expect(events.some((e) => e.type === "done")).toBe(false);
  });

  it("does not let one throwing listener starve the others", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    const seen: string[] = [];
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      player.on(() => {
        throw new Error("listener failure");
      });
      player.on((e) => seen.push(e.type));
      await player.play(toStream(legatoChunks(3, 4410, 220, 0.5)), 0.8, 44100, { preBufferThreshold: 0.01 });
      expect(seen).toContain("stateChange");
      expect(seen).toContain("done");
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("surfaces a failure to resume a suspended context", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    const events: PlayerEvent[] = [];
    player.on((e) => events.push(e));
    const ctx = new MockAudioContext();
    ctx.state = "suspended";
    ctx.resume = async () => {
      throw new Error("resume blocked");
    };
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      writable: true,
      value: function () {
        return ctx;
      },
    });
    await player.play(toStream(legatoChunks(2, 4410, 220, 0.5)), 0.8, 44100, { preBufferThreshold: 0.01 });
    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("settles and closes the context when resuming is blocked", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    const ctx = new MockAudioContext();
    ctx.state = "suspended";
    ctx.resume = async () => {
      throw new Error("resume blocked");
    };
    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      writable: true,
      value: function () {
        return ctx;
      },
    });
    await player.play(toStream(legatoChunks(2, 4410, 220, 0.5)), 0.8, 44100, { preBufferThreshold: 0.01 });
    expect(ctx.state).toBe("closed");
  });

  it("reports the state a failed suspend actually left behind", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    const events: PlayerEvent[] = [];
    player.on((e) => events.push(e));
    const played = player.play(endlessStream(), 0.8, 44100, { preBufferThreshold: 0.01 });
    await waitForState(events, "playing");
    const ctx = installedContext();
    ctx.suspend = async () => {
      throw new Error("suspend blocked");
    };
    player.pause();
    await waitForEvent(events, (e) => e.type === "error", "an error after a failed suspend");
    expect(lastState(events)).toBe("playing");
    player.stop();
    await played;
  });

  it("stays paused when resuming fails", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    const events: PlayerEvent[] = [];
    player.on((e) => events.push(e));
    const played = player.play(endlessStream(), 0.8, 44100, { preBufferThreshold: 0.01 });
    await waitForState(events, "playing");
    const ctx = installedContext();
    player.pause();
    await waitForState(events, "paused");
    ctx.resume = async () => {
      throw new Error("resume blocked");
    };
    player.resume();
    await waitForEvent(events, (e) => e.type === "error", "an error after a failed resume");
    expect(lastState(events)).toBe("paused");
    player.stop();
    await played;
  });

  it("closes the context and finalizes the stream when it fails before any chunk", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    const events: PlayerEvent[] = [];
    player.on((e) => events.push(e));
    let finalized = false;
    // eslint-disable-next-line require-yield
    async function* failing(): AsyncGenerator<AudioChunk> {
      try {
        throw new Error("render failed immediately");
      } finally {
        finalized = true;
      }
    }
    await player.play(failing(), 0.8, 44100, { preBufferThreshold: 1.0 });
    expect(finalized).toBe(true);
    expect(installedContext().state).toBe("closed");
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});

describe("StreamPlayer sample-rate changes", () => {
  function atRate(startSample: number, length: number, value: number, sampleRate: number): AudioChunk {
    const data = [new Float32Array(length).fill(value)];
    return { data, sampleRate, startSample, channels: 1 };
  }

  it("flushes before mixing rates so each buffer keeps its own rate", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    await player.play(toStream([atRate(0, 44100, 0.25, 44100), atRate(44100, 48000, 0.75, 48000)]), 0.8, 44100, {
      preBufferThreshold: 0.01,
    });
    const ctx = installedContext();
    const rates = ctx.createdBuffers.map((b) => b.sampleRate).sort((a, b) => a - b);
    expect(new Set(rates)).toEqual(new Set([44100, 48000]));
  });

  it("never requests a buffer at a rate the stream did not provide", async () => {
    installMockAudioContext();
    const player = new StreamPlayer();
    await player.play(toStream([atRate(0, 22050, 0.25, 22050), atRate(22050, 32000, 0.75, 32000)]), 0.8, 44100, {
      preBufferThreshold: 0.01,
    });
    const ctx = installedContext();
    for (const buf of ctx.createdBuffers) {
      expect([22050, 32000]).toContain(buf.sampleRate);
    }
  });
});
