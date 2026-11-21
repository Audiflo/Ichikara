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

interface TrackMixer {
  id: string;
  gain: GainNode;
  panner: StereoPannerNode | null;
  volume: number;
  muted: boolean;
}

interface Playback {
  controller: AbortController;
  ctx: AudioContext | null;
  gain: GainNode | null;
  closing: Promise<void> | null;
  batch: Map<AudioNode, AudioChunk[]>;
  batchDuration: number;
  mixers: Map<string, TrackMixer>;
  soloTrackId: string | null;
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
const MAX_TRACK_GAIN = 2;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function chunkLength(chunk: AudioChunk): number {
  return elementAt(chunk.data, 0).length;
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

  /** Set one track's gain without re-rendering its audio. */
  setTrackVolume(trackId: string, volume: number): void {
    finiteInRange(volume, "track volume", 0, MAX_TRACK_GAIN);
    const playback = this.playback;
    const mixer = playback?.mixers.get(trackId);
    if (!playback || !mixer) return;
    mixer.volume = volume;
    this.applyMixerGain(playback, mixer);
  }

  /** Mute or unmute one track while playback continues. */
  setTrackMute(trackId: string, muted: boolean): void {
    const playback = this.playback;
    const mixer = playback?.mixers.get(trackId);
    if (!playback || !mixer) return;
    mixer.muted = muted;
    this.applyMixerGain(playback, mixer);
  }

  /** Solo one track, or clear solo with null. */
  setSolo(trackId: string | null): void {
    const playback = this.playback;
    if (!playback) return;
    playback.soloTrackId = trackId;
    for (const mixer of playback.mixers.values()) this.applyMixerGain(playback, mixer);
  }

  /** Set one track's stereo position in [-1, 1]. */
  setTrackPan(trackId: string, pan: number): void {
    finiteInRange(pan, "track pan", -1, 1);
    const playback = this.playback;
    const mixer = playback?.mixers.get(trackId);
    if (!playback || !mixer) return;
    if (mixer.panner) mixer.panner.pan.value = pan;
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

  private ensureTrackMixer(playback: Playback, chunk: AudioChunk): TrackMixer | null {
    const { ctx, gain: master } = playback;
    const id = chunk.trackId;
    if (!ctx || !master || id === undefined) return null;
    const existing = playback.mixers.get(id);
    if (existing) return existing;
    const volume = chunk.trackVolume ?? 1;
    const pan = chunk.trackPan ?? 0;
    const muted = chunk.trackMute ?? false;
    const solo = chunk.trackSolo ?? false;
    finiteInRange(volume, `track ${id} volume`, 0, MAX_TRACK_GAIN);
    finiteInRange(pan, `track ${id} pan`, -1, 1);
    const gain = ctx.createGain();
    const panner = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
    if (panner) {
      gain.connect(panner);
      panner.connect(master);
    } else {
      gain.connect(master);
    }
    if (solo && playback.soloTrackId === null) playback.soloTrackId = id;
    const mixer: TrackMixer = { id, gain, panner, volume, muted };
    playback.mixers.set(id, mixer);
    this.applyMixerGain(playback, mixer);
    if (panner) panner.pan.value = pan;
    for (const other of playback.mixers.values()) this.applyMixerGain(playback, other);
    return mixer;
  }

  private applyMixerGain(playback: Playback, mixer: TrackMixer): void {
    const silenced = mixer.muted || (playback.soloTrackId !== null && playback.soloTrackId !== mixer.id);
    mixer.gain.gain.value = silenced ? 0 : mixer.volume;
  }

  private targetFor(playback: Playback, chunk: AudioChunk): AudioNode | null {
    const master = playback.gain;
    if (!master) return null;
    const mixer = this.ensureTrackMixer(playback, chunk);
    return mixer ? mixer.panner ?? mixer.gain : master;
  }

  private flush(playback: Playback): void {
    const { ctx, batch } = playback;
    if (!ctx || batch.size === 0 || playback.controller.signal.aborted) return;
    const groups = [...batch.entries()];
    const chunks = groups.flatMap(([, group]) => group);
    const first = elementAt(chunks, 0);
    const start = Math.min(...chunks.map((chunk) => chunk.startSample));
    const endSample = Math.max(...chunks.map((chunk) => chunk.startSample + chunkLength(chunk)));
    playback.batch = new Map();
    playback.batchDuration = 0;
    const expected = playback.startTime + start / first.sampleRate;
    const when = Math.max(ctx.currentTime + MIN_SCHEDULE_LEAD_SECONDS, expected);
    const offset = when - expected;
    const duration = (endSample - start) / first.sampleRate;
    for (const [target, group] of groups) {
      const mixed = mixAudioChunks(group.map((chunk) => ({ ...chunk, startSample: chunk.startSample - start })));
      const length = elementAt(mixed.data, 0).length;
      if (!length) continue;
      const buffer = ctx.createBuffer(mixed.channels, length, mixed.sampleRate);
      for (const [channel, data] of mixed.data.entries()) buffer.getChannelData(channel).set(data);
      const groupDuration = length / mixed.sampleRate;
      if (offset < groupDuration) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(target);
        source.start(when, offset, groupDuration - offset);
      }
    }
    if (offset > 0) this.emit({ type: "bufferUnderrun", bufferAhead: 0 });
    playback.renderedSamples = Math.max(playback.renderedSamples, endSample);
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
    const target = this.targetFor(playback, chunk);
    if (!target) return;
    const existing = playback.batch.get(target);
    if (existing) {
      const first = elementAt(existing, 0);
      if (first.sampleRate !== chunk.sampleRate || first.channels !== chunk.channels) this.flush(playback);
    }
    const group = playback.batch.get(target) ?? [];
    group.push(chunk);
    playback.batch.set(target, group);
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
      batch: new Map(),
      batchDuration: 0,
      mixers: new Map(),
      soloTrackId: null,
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
        this.ensureTrackMixer(playback, result.value);
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
      playback.batch = new Map();
      playback.mixers.clear();
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
