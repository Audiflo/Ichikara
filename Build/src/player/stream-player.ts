import type { AudioChunk } from "../core/types";
import { mixAudioChunks, validateAudioChunk } from "../core/audio";
import { elementAt, finiteInRange } from "../core/validation";

/** User-visible transport state. */
export type PlayerState = "idle" | "playing" | "paused";

/** Transport, scheduling, completion, and failure notifications. */
export type PlayerEvent =
  | { type: "stateChange"; state: PlayerState }
  | { type: "progress"; renderedSamples: number; bufferAhead: number }
  | { type: "done" }
  | { type: "bufferUnderrun"; bufferAhead: number }
  | { type: "error"; error: Error };

/** Playback gain, context sample rate, and initial buffered duration in seconds. */
export interface PlayOptions {
  volume?: number;
  sampleRate?: number;
  preBufferThreshold?: number;
}

interface Playback {
  controller: AbortController;
  ctx: AudioContext | null;
  gain: GainNode | null;
  closing: Promise<void> | null;
  batch: AudioChunk[];
  batchDuration: number;
  startTime: number;
  endTime: number;
  renderedSamples: number;
  underrunEmitted: boolean;
}

const BATCH_SECONDS = 0.5;
const START_LEAD_SECONDS = 0.05;
const MIN_SCHEDULE_LEAD_SECONDS = 0.01;
const UNDERRUN_SECONDS = 0.15;
const END_CHECK_MS = 50;
const STOP_FADE_SECONDS = 0.05;
const STOP_CLOSE_MS = 60;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  let onAbort: () => void = () => {};
  const cancelled = new Promise<undefined>((resolve) => {
    onAbort = () => resolve(undefined);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([promise, cancelled]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function waitForPlaybackEnd(playback: Playback): Promise<void> {
  const { ctx, controller } = playback;
  if (!ctx || controller.signal.aborted || ctx.currentTime >= playback.endTime) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearInterval(timer);
      controller.signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setInterval(() => {
      if (ctx.currentTime >= playback.endTime) finish();
    }, END_CHECK_MS);
    controller.signal.addEventListener("abort", finish, { once: true });
  });
}

/** Schedule streamed audio on its absolute timeline with independently owned playback sessions.
 * See https://developer.mozilla.org/en-US/docs/Web/API/AudioContext
 */
export class StreamPlayer {
  private playback: Playback | null = null;
  private state: PlayerState = "idle";
  private listeners = new Set<(event: PlayerEvent) => void>();

  /** Set current output gain in [0, 1]; throw RangeError for invalid gain. */
  setVolume(volume: number): void {
    finiteInRange(volume, "volume", 0, 1);
    if (this.playback?.gain) this.playback.gain.gain.value = volume;
  }

  /** Read the current transport state. */
  get currentState(): PlayerState {
    return this.state;
  }

  /** Elapsed song seconds from the AudioContext clock, frozen by suspension and zero before playback.
   * Reads never infer position from rendered buffers or wall-clock time.
   */
  get currentTime(): number {
    const playback = this.playback;
    if (!playback?.ctx || this.state === "idle") return 0;
    return Math.max(0, playback.ctx.currentTime - playback.startTime);
  }

  /** Subscribe to transport events; return an unsubscribe function. */
  on(listener: (event: PlayerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: PlayerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[StreamPlayer] event listener threw", { event: event.type, error });
      }
    }
  }

  private setState(state: PlayerState): void {
    this.state = state;
    this.emit({ type: "stateChange", state });
  }

  private close(playback: Playback, fade = false): Promise<void> {
    if (playback.closing) return playback.closing;
    const { ctx, gain } = playback;
    playback.closing = (async () => {
      if (!ctx || ctx.state === "closed") return;
      try {
        if (fade && gain && ctx.state === "running") {
          gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + STOP_FADE_SECONDS);
          await new Promise<void>((resolve) => setTimeout(resolve, STOP_CLOSE_MS));
        }
        await ctx.close();
      } catch (error) {
        this.emit({ type: "error", error: toError(error) });
      }
    })();
    return playback.closing;
  }

  private flush(playback: Playback): void {
    const { ctx, gain, batch } = playback;
    if (!ctx || !gain || !batch.length || playback.controller.signal.aborted) return;
    const start = Math.min(...batch.map((chunk) => chunk.startSample));
    const mixed = mixAudioChunks(batch.map((chunk) => ({ ...chunk, startSample: chunk.startSample - start })));
    const length = elementAt(mixed.data, 0).length;
    playback.batch = [];
    playback.batchDuration = 0;
    if (!length) return;
    const buffer = ctx.createBuffer(mixed.channels, length, mixed.sampleRate);
    for (const [channel, data] of mixed.data.entries()) buffer.getChannelData(channel).set(data);
    const expected = playback.startTime + start / mixed.sampleRate;
    const when = Math.max(ctx.currentTime + MIN_SCHEDULE_LEAD_SECONDS, expected);
    const offset = when - expected;
    const duration = length / mixed.sampleRate;
    if (offset < duration) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start(when, offset, duration - offset);
    }
    if (offset > 0) this.emit({ type: "bufferUnderrun", bufferAhead: 0 });
    playback.renderedSamples = Math.max(playback.renderedSamples, start + length);
    playback.endTime = Math.max(playback.endTime, expected + duration);
    const bufferAhead = Math.max(0, playback.endTime - ctx.currentTime);
    if (bufferAhead < UNDERRUN_SECONDS && !playback.underrunEmitted) {
      playback.underrunEmitted = true;
      this.emit({ type: "bufferUnderrun", bufferAhead });
    }
    this.emit({ type: "progress", renderedSamples: playback.renderedSamples, bufferAhead });
  }

  private schedule(playback: Playback, chunk: AudioChunk): void {
    if (playback.controller.signal.aborted) return;
    const length = validateAudioChunk(chunk);
    const first = playback.batch[0];
    if (first && (first.sampleRate !== chunk.sampleRate || first.channels !== chunk.channels)) this.flush(playback);
    playback.batch.push(chunk);
    playback.batchDuration += length / chunk.sampleRate;
    if (playback.batchDuration >= BATCH_SECONDS) this.flush(playback);
  }

  /** Play an async audio source, replacing prior playback. Settle after completion or cancellation.
   * Errors are delivered through the error event. Options override positional gain and sample rate.
   */
  async play(stream: AsyncIterable<AudioChunk>, volume = 0.8, sampleRate?: number, options: PlayOptions = {}): Promise<void> {
    this.stop();
    const playback: Playback = {
      controller: new AbortController(),
      ctx: null,
      gain: null,
      closing: null,
      batch: [],
      batchDuration: 0,
      startTime: 0,
      endTime: 0,
      renderedSamples: 0,
      underrunEmitted: false,
    };
    this.playback = playback;
    const { signal } = playback.controller;
    const isAborted = (): boolean => signal.aborted;
    let iterator: AsyncIterator<AudioChunk> | undefined;
    let completed = false;
    try {
      const preBufferThreshold = finiteInRange(options.preBufferThreshold ?? 1, "preBufferThreshold", 0);
      const gainValue = finiteInRange(options.volume ?? volume, "volume", 0, 1);
      const ctx = new AudioContext({ sampleRate: options.sampleRate ?? sampleRate ?? 44100 });
      playback.ctx = ctx;
      const gain = ctx.createGain();
      playback.gain = gain;
      gain.connect(ctx.destination);
      gain.gain.value = gainValue;
      iterator = stream[Symbol.asyncIterator]();
      if (ctx.state === "suspended") await untilAborted(ctx.resume(), signal);
      if (isAborted()) return;
      const buffered: AudioChunk[] = [];
      let bufferedSeconds = 0;
      let sourceDone = false;
      while (!isAborted()) {
        const result = await untilAborted(iterator.next(), signal);
        if (!result || isAborted()) return;
        if (result.done) {
          sourceDone = true;
          break;
        }
        bufferedSeconds += validateAudioChunk(result.value) / result.value.sampleRate;
        buffered.push(result.value);
        if (bufferedSeconds >= preBufferThreshold) break;
      }
      playback.startTime = ctx.currentTime + START_LEAD_SECONDS;
      this.setState("playing");
      for (const chunk of buffered) this.schedule(playback, chunk);
      this.flush(playback);
      while (!sourceDone && !isAborted()) {
        const result = await untilAborted(iterator.next(), signal);
        if (!result || isAborted()) return;
        if (result.done) break;
        this.schedule(playback, result.value);
      }
      this.flush(playback);
      await waitForPlaybackEnd(playback);
      completed = !signal.aborted;
    } catch (error) {
      if (!signal.aborted && this.playback === playback) this.emit({ type: "error", error: toError(error) });
    } finally {
      if (iterator?.return) {
        const finalized = iterator.return().catch((error: unknown) => {
          console.error("[StreamPlayer] failed to finalize the source stream", error);
        });
        await untilAborted(finalized, signal);
      }
      await this.close(playback);
      playback.batch = [];
      if (this.playback === playback) {
        this.playback = null;
        this.setState("idle");
        if (completed) this.emit({ type: "done" });
      }
    }
  }

  /** Pause the active AudioContext; report suspension failures through error events. */
  pause(): void {
    const playback = this.playback;
    if (this.state !== "playing" || !playback?.ctx) return;
    this.setState("paused");
    playback.ctx.suspend().catch((error: unknown) => {
      if (this.playback !== playback || playback.controller.signal.aborted) return;
      this.emit({ type: "error", error: toError(error) });
      this.setState("playing");
    });
  }

  /** Resume paused audio; report failures and preserve the paused transport state. */
  resume(): void {
    const playback = this.playback;
    if (this.state !== "paused" || !playback?.ctx) return;
    this.setState("playing");
    playback.ctx.resume().catch((error: unknown) => {
      if (this.playback !== playback || playback.controller.signal.aborted) return;
      this.emit({ type: "error", error: toError(error) });
      this.setState("paused");
    });
  }

  /** Abort active consumption, fade output, and close its context without affecting later plays. */
  stop(): void {
    const playback = this.playback;
    if (!playback) return;
    this.playback = null;
    playback.controller.abort();
    this.close(playback, true).catch((error: unknown) => this.emit({ type: "error", error: toError(error) }));
    this.setState("idle");
  }
}
