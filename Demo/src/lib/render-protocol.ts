import { scaleVoice, type Project, type Score, type VoiceConfig } from "@audiflo/ichikara";

/** Voice controls that can be retargeted between notes during playback. */
export type VoiceParameters = Parameters<typeof scaleVoice>[1];

/** Immutable job snapshot sent over this application's dedicated worker channel. */
export type RenderJob =
  | { project: Project; sampleRate?: number; applyMix?: boolean }
  | {
      score: Score;
      voice: VoiceConfig;
      langId: string;
    };

/** Commands accepted by the render worker. */
export type RenderRequest =
  | ({ type: "start" } & RenderJob)
  | { type: "ack" }
  | { type: "update"; trackId: string; baseVoice: VoiceConfig; parameters: VoiceParameters };

/** Transferable audio and terminal responses emitted by the render worker. */
export type RenderResponse =
  | {
      type: "chunk";
      data: ArrayBuffer[];
      startSample: number;
      sampleRate: number;
      trackId?: string | undefined;
      trackVolume?: number | undefined;
      trackPan?: number | undefined;
      trackMute?: boolean | undefined;
      trackSolo?: boolean | undefined;
    }
  | { type: "done" }
  | { type: "error"; error: string };

/** Maximum unconsumed chunks retained between worker and player. */
export const RENDER_QUEUE_CAPACITY = 6;
