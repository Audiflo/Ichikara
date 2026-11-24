import { scaleVoice, streamScore, streamProject, type VoiceConfig } from "@audiflo/ichikara";
import {
  RENDER_QUEUE_CAPACITY,
  type RenderJob,
  type RenderRequest,
  type RenderResponse,
  type VoiceParameters,
} from "./render-protocol";

interface VoiceOverride {
  baseVoice: VoiceConfig;
  parameters: VoiceParameters;
}

let outstanding = 0;
let ackWaiter: (() => void) | null = null;
let running = false;
const overrides = new Map<string, VoiceOverride>();

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
  if (msg.type === "update") {
    overrides.set(msg.trackId, { baseVoice: msg.baseVoice, parameters: msg.parameters });
    return;
  }
  if (!running) {
    running = true;
    runJob(msg).catch((err: unknown) => send({ type: "error", error: err instanceof Error ? err.message : String(err) }));
  }
};

async function runJob(job: RenderJob): Promise<void> {
  try {
    const sampleRate = "project" in job ? (job.sampleRate ?? 44100) : undefined;
    const voiceForTrack = (track: { id: string; voice: VoiceConfig; parameters: VoiceParameters }): VoiceConfig => {
      const override = overrides.get(track.id);
      const scaled = scaleVoice(override?.baseVoice ?? track.voice, override?.parameters ?? track.parameters);
      return { ...scaled, sampleRate: sampleRate ?? scaled.sampleRate, channels: 1 as const };
    };
    const stream =
      "project" in job
        ? streamProject(job.project, sampleRate, {
            applyMix: job.applyMix ?? true,
            voiceForTrack,
          })
        : streamScore(job.score, job.voice, job.langId);
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
          trackId: chunk.trackId,
          trackVolume: chunk.trackVolume,
          trackPan: chunk.trackPan,
          trackMute: chunk.trackMute,
          trackSolo: chunk.trackSolo,
        },
        bufs,
      );
    }
    send({ type: "done" });
  } catch (err) {
    send({ type: "error", error: err instanceof Error ? err.message : String(err) });
  } finally {
    overrides.clear();
    running = false;
  }
}
