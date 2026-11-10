import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createWorkerStream } from "../../src/lib/workerStream.ts";
import type { RenderJob, RenderRequest, RenderResponse } from "../../src/lib/render-protocol.ts";

class TestWorker {
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  terminated = false;
  readonly requests: RenderRequest[] = [];
  failStart = false;

  postMessage(request: RenderRequest): void {
    if (this.failStart) throw new Error("Cannot clone score");
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: RenderResponse): void {
    this.onmessage?.(new MessageEvent("message", { data: response }));
  }
}

const job: RenderJob = {
  score: { notes: [], resolution: 480, tempos: [{ tick: 0, tempo: 120 }] },
  langId: "jp",
  voice: {
    name: "Test voice",
    sampleRate: 44100,
    channels: 1,
    glottal: { openQuotient: 0.5, speedQuotient: 2.4, tenseness: 0.5, aspiration: 0, power: 1 },
    formant: { scale: 1, shift: 0, bandwidth: 1 },
    vibrato: { rate: 5, depth: 0, attack: 0 },
  },
};

await describe("worker stream lifecycle", async () => {
  let worker: TestWorker;
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    worker = new TestWorker();
    original = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: function () {
        return worker;
      },
    });
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "Worker", original);
    else Reflect.deleteProperty(globalThis, "Worker");
  });

  await it("terminates a worker when posting the initial score fails", () => {
    worker.failStart = true;
    assert.throws(() => createWorkerStream(job), /Cannot clone score/);
    assert.equal(worker.terminated, true);
  });

  await it("releases a completed worker even when the consumer has not started", async () => {
    const source = createWorkerStream(job);
    worker.respond({ type: "done" });
    assert.equal(worker.terminated, true);
    assert.equal((await source.stream.next()).done, true);
  });

  await it("wakes a pending read and terminates when deserialization fails", async () => {
    const source = createWorkerStream(job);
    const pending = source.stream.next();
    worker.onmessageerror?.(new MessageEvent("messageerror"));
    assert.equal(worker.terminated, true);
    await assert.rejects(pending, /deserialize/i);
  });

  await it("drains queued audio after normal completion", async () => {
    const source = createWorkerStream(job);
    worker.respond({ type: "chunk", startSample: 0, sampleRate: 44100, data: [new Float32Array([0.25]).buffer] });
    worker.respond({ type: "done" });
    const result = await source.stream.next();
    assert.equal(result.done, false);
    assert.deepEqual(result.value.data[0], new Float32Array([0.25]));
    assert.equal((await source.stream.next()).done, true);
  });

  await it("cancellation discards queued and late audio", async () => {
    const source = createWorkerStream(job);
    source.cancel();
    worker.respond({ type: "chunk", startSample: 0, sampleRate: 44100, data: [new Float32Array([0.25]).buffer] });
    assert.equal((await source.stream.next()).done, true);
    assert.equal(worker.terminated, true);
  });

  await it("surfaces a render error to the awaiting consumer", async () => {
    const source = createWorkerStream(job);
    const pending = source.stream.next();
    worker.respond({ type: "error", error: "Unknown voice" });
    await assert.rejects(pending, /Unknown voice/);
    assert.equal(worker.terminated, true);
  });
});
