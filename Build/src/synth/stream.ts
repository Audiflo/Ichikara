import type { AudioChunk, Score, VoiceConfig, FormantTarget, Note, LanguageModule } from "../core/types";
import { getLanguage } from "../langs/index";
import { getVoice, chitoseChika } from "../voices/index";
import { mixAudioChunks } from "../core/audio";
import { elementAt, integerInRange } from "../core/validation";
import { TempoMap } from "../core/timing";
import { renderNote } from "./renderer";

/** Render notes in absolute tick order, integrating tempo changes through notes and gaps.
 * Input notes and tempos are not mutated. Unknown voices/languages and invalid timing throw.
 */
export async function* streamScore(score: Score, voiceInput?: string | VoiceConfig, langId?: string): AsyncGenerator<AudioChunk> {
  const lang = getLanguage(langId ?? "jp");
  const voice = typeof voiceInput === "object" ? voiceInput : getVoice(voiceInput ?? score.voice ?? chitoseChika.name);
  if (!lang) throw new Error(`Language not found: ${langId ?? "jp"}`);
  if (!voice) throw new Error(`Voice not found: ${typeof voiceInput === "string" ? voiceInput : chitoseChika.name}`);

  const sr = voice.sampleRate;
  const { resolution } = score;
  const timing = new TempoMap(score.tempos, resolution);
  let implicitTick = 0;
  const notes = score.notes
    .map((note) => {
      const tick = note.tick ?? implicitTick;
      integerInRange(tick, "note tick", 0);
      integerInRange(note.length, "note length", 1);
      implicitTick = integerInRange(tick + note.length, "note end", 1);
      return { ...note, tick };
    })
    .sort((a, b) => a.tick - b.tick);

  const accentOffsets = computeAccentOffsets(notes, lang);

  const OVERLAP_MS = 5;
  const overlapSamples = Math.round((OVERLAP_MS / 1000) * sr);

  let prevFormants: FormantTarget[] | undefined;
  let previousEndTick = -1;
  for (const [ni, originalNote] of notes.entries()) {
    let note = originalNote;
    const noteTick = note.tick;
    const startSample = Math.round(timing.secondsAt(noteTick) * sr);
    const endSample = Math.round(timing.secondsAt(noteTick + note.length) * sr);
    integerInRange(endSample, "note end sample", 0);
    const legato = previousEndTick === noteTick;
    if (!legato) {
      prevFormants = undefined;
    }
    const extraSamples = legato ? Math.min(overlapSamples, startSample) : 0;

    const accent = accentOffsets[ni];
    if (accent !== undefined) {
      note = { ...note, pitchAccent: accent };
    }
    const { chunk, finalFormants } = renderNote(note, voice, lang, timing.tempoAt(noteTick), resolution, prevFormants, extraSamples, {
      sampleLength: Math.max(1, endSample - startSample),
      tickAtSample: (sample) => timing.tickAt((startSample + sample) / sr) - noteTick,
    });
    prevFormants = finalFormants;
    chunk.startSample = startSample - extraSamples;
    const firstChannel = elementAt(chunk.data, 0);
    if (voice.channels === 2 && chunk.data.length === 1) {
      chunk.data = [new Float32Array(firstChannel), new Float32Array(firstChannel)];
      chunk.channels = 2;
    }
    yield chunk;
    await new Promise((r) => setTimeout(r, 0));
    previousEndTick = noteTick + note.length;
  }
}

function computeAccentOffsets(notes: Note[], lang: LanguageModule): (number | undefined)[] {
  if (!lang.resolveAccents) return [];
  const offsets = new Array<number | undefined>(notes.length).fill(undefined);
  const phraseLyrics: string[] = [];
  const phraseIndices: number[] = [];
  let prevTick = 0;
  for (const [ni, n] of notes.entries()) {
    const noteTick = n.tick ?? prevTick;
    const gap = Math.max(0, noteTick - prevTick);
    if (gap > 0 && phraseLyrics.length > 0) {
      const result = lang.resolveAccents(phraseLyrics);
      for (let oi = 0; oi < result.length; oi++) {
        if (result[oi] !== undefined) offsets[elementAt(phraseIndices, oi)] = result[oi];
      }
      phraseLyrics.length = 0;
      phraseIndices.length = 0;
    }
    phraseLyrics.push(n.lyric);
    phraseIndices.push(ni);
    prevTick = noteTick + n.length;
  }
  if (phraseLyrics.length > 0) {
    const result = lang.resolveAccents(phraseLyrics);
    for (let oi = 0; oi < result.length; oi++) {
      if (result[oi] !== undefined) offsets[elementAt(phraseIndices, oi)] = result[oi];
    }
  }
  return offsets;
}

export async function renderScore(score: Score, voiceInput?: string | VoiceConfig, langId?: string): Promise<AudioChunk[]> {
  const chunks: AudioChunk[] = [];
  for await (const chunk of streamScore(score, voiceInput, langId)) chunks.push(chunk);
  return chunks;
}

export function mixChunks(chunks: AudioChunk[]): AudioChunk {
  return mixAudioChunks(chunks);
}
