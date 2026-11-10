import { streamScore, streamProject } from "ichikara";
import { RENDER_QUEUE_CAPACITY, type RenderJob, type RenderRequest, type RenderResponse } from "./render-protocol";

let outstanding = 0;
let ackWaiter: (() => void) | null = null;
let running = false;

function send(message: RenderResponse, transfer: Transferable[] = []): void {
  postMessage(message, transfer);
}

onmessage = (e: MessageEvent<RenderRequest>) => {
  const msg = e.data;
  if (msg.type === "ack") {
    outstanding = Math.max(0, outstanding - 1);
    if (ackWaiter) {
      const w = ackWaiter;
      ackWaiter = null;
      w();
    }
    return;
  }
  if (!running) {
    running = true;
    runJob(msg).catch((err: unknown) => send({ type: "error", error: err instanceof Error ? err.message : String(err) }));
  }
};

async function runJob(job: RenderJob): Promise<void> {
  try {
    const stream = "project" in job ? streamProject(job.project, job.sampleRate) : streamScore(job.score, job.voice, job.langId);
    for await (const chunk of stream) {
      while (outstanding >= RENDER_QUEUE_CAPACITY) {
        await new Promise<void>((res) => {
          ackWaiter = res;
        });
      }
      const bufs = chunk.data.map((c) => new Float32Array(c).buffer);
      outstanding++;
      send(
        {
          type: "chunk",
          data: bufs,
          startSample: chunk.startSample,
          sampleRate: chunk.sampleRate,
        },
        bufs,
      );
    }
    send({ type: "done" });
  } catch (err) {
    send({ type: "error", error: err instanceof Error ? err.message : String(err) });
  } finally {
    running = false;
  }
}
