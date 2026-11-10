import type { AudioChunk } from "ichikara";

/** An audio producer whose cancellation releases its owned resources. */
export interface CancellableAudio {
  stream: AsyncIterable<AudioChunk>;
  cancel(): void;
}

/** Prefer the primary renderer, falling back only before it delivers audio.
 * Cancellation suppresses fallback. Both renderers' later failures propagate to playback.
 * The caller receives the primary failure through onFallback before fallback begins.
 */
export function createResilientStream(
  primary: () => CancellableAudio,
  fallback: () => AsyncIterable<AudioChunk>,
  onFallback: (error: Error) => void,
): { stream: AsyncGenerator<AudioChunk>; cancel(): void } {
  let active: CancellableAudio | undefined;
  let cancelled = false;
  const isCancelled = (): boolean => cancelled;

  const cancel = (): void => {
    cancelled = true;
    active?.cancel();
  };

  const stream = (async function* (): AsyncGenerator<AudioChunk> {
    let delivered = false;
    try {
      if (isCancelled()) return;
      try {
        active = primary();
        for await (const chunk of active.stream) {
          if (isCancelled()) return;
          delivered = true;
          yield chunk;
        }
        return;
      } catch (error) {
        active?.cancel();
        if (isCancelled()) return;
        if (delivered) throw error;
        onFallback(error instanceof Error ? error : new Error(String(error)));
      }
      for await (const chunk of fallback()) {
        if (isCancelled()) return;
        yield chunk;
      }
    } finally {
      active?.cancel();
    }
  })();

  return { stream, cancel };
}
