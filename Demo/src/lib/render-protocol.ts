import type { Project, Score, VoiceConfig } from "@audiflo/ichikara";

/** Immutable job snapshot sent over this application's dedicated worker channel. */
export type RenderJob =
  | { project: Project; sampleRate?: number }
  | {
      score: Score;
      voice: VoiceConfig;
      langId: string;
    };

/** Commands accepted by the render worker. */
export type RenderRequest = ({ type: "start" } & RenderJob) | { type: "ack" };

/** Transferable audio and terminal responses emitted by the render worker. */
export type RenderResponse =
  | { type: "chunk"; data: ArrayBuffer[]; startSample: number; sampleRate: number }
  | { type: "done" }
  | { type: "error"; error: string };

/** Maximum unconsumed chunks retained between worker and player. */
export const RENDER_QUEUE_CAPACITY = 6;
