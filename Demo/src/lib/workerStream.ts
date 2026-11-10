import type { AudioChunk } from "ichikara";
import type { RenderJob, RenderRequest, RenderResponse } from "./render-protocol";

/** A cancellable audio producer; cancellation terminates the worker and wakes pending reads. */
export interface WorkerStream {
  stream: AsyncGenerator<AudioChunk>;
  cancel: () => void;
}
/** Start a dedicated render job; throw when the browser cannot construct the worker. */
export function createWorkerStream(payload: RenderJob): WorkerStream {
  const worker = new Worker(new URL("./render.worker.ts", import.meta.url), {
    type: "module",
  });
  const queue: AudioChunk[] = [];
  type State = { type: "active" | "complete" | "cancelled" } | { type: "failed"; error: Error };
  let state: State = { type: "active" };
  let resolveNext: (() => void) | null = null;
  const currentState = (): State => state;

  function wake(): void {
    const resolve = resolveNext;
    resolveNext = null;
    resolve?.();
  }

  function finish(next: State): void {
    state = next;
    if (next.type !== "complete") queue.length = 0;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    wake();
  }

  function send(message: RenderRequest): void {
    if (state.type === "active") worker.postMessage(message);
  }

  worker.onmessage = (event: MessageEvent<RenderResponse>) => {
    if (state.type !== "active") return;
    const message = event.data;
    switch (message.type) {
      case "chunk":
        queue.push({
          data: message.data.map((buffer) => new Float32Array(buffer)),
          startSample: message.startSample,
          sampleRate: message.sampleRate,
          channels: message.data.length,
        });
        wake();
        break;
      case "done":
        finish({ type: "complete" });
        break;
      case "error":
        finish({ type: "failed", error: new Error(message.error) });
        break;
    }
  };
  worker.onerror = (event) => finish({ type: "failed", error: new Error(event.message || "Render worker failed") });
  worker.onmessageerror = () => finish({ type: "failed", error: new Error("Could not deserialize render worker response") });

  const cancel = (): void => finish({ type: "cancelled" });
  try {
    send({ type: "start", ...payload });
  } catch (error) {
    cancel();
    throw error;
  }

  const stream = (async function* (): AsyncGenerator<AudioChunk> {
    try {
      while (true) {
        const status = currentState();
        if (status.type === "cancelled") return;
        if (status.type === "failed") throw status.error;
        const chunk = queue.shift();
        if (chunk) {
          yield chunk;
          send({ type: "ack" });
        } else if (status.type === "complete") {
          return;
        } else {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
      }
    } finally {
      cancel();
    }
  })();
  return { stream, cancel };
}
