import assert from "node:assert/strict";
import { it } from "node:test";
import type { AudioChunk } from "@audiflo/ichikara";
import { createResilientStream } from "../../src/lib/render/resilient-stream.ts";

const chunk: AudioChunk = { data: [new Float32Array([0.5])], channels: 1, sampleRate: 44100, startSample: 0 };

async function collect(stream: AsyncIterable<AudioChunk>): Promise<AudioChunk[]> {
  const chunks: AudioChunk[] = [];
  for await (const value of stream) chunks.push(value);
  return chunks;
}

await it("falls back when worker construction fails", async () => {
  let reason = "";
  const source = createResilientStream(
    () => {
      throw new Error("Workers unavailable");
    },
    async function* () {
      yield chunk;
    },
    (error) => {
      reason = error.message;
    },
  );
  assert.deepEqual(await collect(source.stream), [chunk]);
  assert.equal(reason, "Workers unavailable");
});

await it("falls back on an asynchronous failure before the first chunk", async () => {
  let released = false;
  const source = createResilientStream(
    () => ({
      stream: { [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error("Worker load failed")) }) },
      cancel: () => {
        released = true;
      },
    }),
    async function* () {
      yield chunk;
    },
    () => {},
  );
  assert.deepEqual(await collect(source.stream), [chunk]);
  assert.equal(released, true);
});

await it("propagates a midstream failure instead of replaying the phrase", async () => {
  const source = createResilientStream(
    () => ({
      stream: (async function* () {
        yield chunk;
        throw new Error("Render failed");
      })(),
      cancel: () => {},
    }),
    async function* () {
      yield chunk;
    },
    () => {
      throw new Error("Must not start fallback after audio was delivered");
    },
  );
  assert.deepEqual((await source.stream.next()).value, chunk);
  await assert.rejects(source.stream.next(), /Render failed/);
});

await it("does not start a fallback after cancellation", async () => {
  const source = createResilientStream(
    () => {
      throw new Error("Must not start a cancelled job");
    },
    async function* () {
      yield chunk;
    },
    () => {
      throw new Error("Must not start fallback");
    },
  );
  source.cancel();
  assert.deepEqual(await collect(source.stream), []);
});

await it("propagates fallback errors to the consumer", async () => {
  const source = createResilientStream(
    () => {
      throw new Error("Workers unavailable");
    },
    () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error("Unknown language")) }) }),
    () => {},
  );
  await assert.rejects(collect(source.stream), /Unknown language/);
});
