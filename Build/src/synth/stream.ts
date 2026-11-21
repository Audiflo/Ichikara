import type { AudioChunk, Score, VoiceConfig, FormantTarget, Note, LanguageModule } from "../core/types";
import { getLanguage } from "../langs/index";
import { isContinuationLyric, isRestLyric, REST_PHONEME } from "../langs/alias";
import { getVoice, chitoseChika } from "../voices/index";
import { mixAudioChunks } from "../core/audio";
import { elementAt, integerInRange } from "../core/validation";
import { TempoMap } from "../core/timing";
import { renderNote, type RenderState } from "./renderer";

/** Per-note voice selection for live parameter updates. */
export interface StreamScoreOptions {
  voiceForNote?: (note: Note, startSample: number) => VoiceConfig | undefined;
}

function resolvedPhonemes(note: Note, lang: LanguageModule): string[] {
  const raw = note.phonemes ?? lang.lyricToPhonemes(note.lyric);
  const symbols = note.phonemes !== undefined && lang.expandPhonemes ? lang.expandPhonemes(raw) : raw;
  return symbols.filter((symbol) => lang.phonemes.has(symbol));
}

function continuationSource(note: Note, lang: LanguageModule): string | undefined {
  if (isRestLyric(note.lyric) || isContinuationLyric(note.lyric)) return undefined;
  const symbols = resolvedPhonemes(note, lang);
  for (let index = symbols.length - 1; index >= 0; index--) {
    const symbol = elementAt(symbols, index);
    if (lang.phonemes.get(symbol)?.type !== "silence") return symbol;
  }
  return undefined;
}

/** Render notes in absolute tick order, integrating tempo changes through notes and gaps.
 * Input notes and tempos are not mutated. Unknown voices/languages and invalid timing throw.
 */
export async function* streamScore(
  score: Score,
  voiceInput?: string | VoiceConfig,
  langId?: string,
  options: StreamScoreOptions = {},
): AsyncGenerator<AudioChunk> {
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
  let state: RenderState | undefined;
  let previousEndTick = -1;
  let previousEndSample = -1;
  let continuationSymbol: string | undefined;
  for (const [ni, originalNote] of notes.entries()) {
    let note = originalNote;
    const noteTick = note.tick;
    const startSample = Math.round(timing.secondsAt(noteTick) * sr);
    const endSample = Math.round(timing.secondsAt(noteTick + note.length) * sr);
    integerInRange(endSample, "note end sample", 0);
    const noteVoice = options.voiceForNote?.(note, startSample) ?? voice;

    const gapFromPrevious = previousEndSample < 0 ? Infinity : startSample - previousEndSample;
    const legatoWithPrevious = previousEndTick === noteTick || (gapFromPrevious >= 0 && gapFromPrevious < overlapSamples);
    const extraSamples = legatoWithPrevious ? Math.min(overlapSamples, startSample) : 0;
    const headFadeSamples = legatoWithPrevious ? Math.min(extraSamples, Math.max(0, overlapSamples - gapFromPrevious)) : 0;

    const isContinuation = note.phonemes === undefined && isContinuationLyric(note.lyric);
    const continuesPrevious = isContinuation && legatoWithPrevious && continuationSymbol !== undefined;
    const nextNote = notes[ni + 1];
    let tailFadeSamples = 0;
    if (nextNote) {
      const nextStartSample = Math.round(timing.secondsAt(nextNote.tick) * sr);
      const gapToNext = nextStartSample - endSample;
      const legatoWithNext = noteTick + note.length === nextNote.tick || (gapToNext >= 0 && gapToNext < overlapSamples);
      if (legatoWithNext) tailFadeSamples = Math.min(overlapSamples, Math.max(0, overlapSamples - gapToNext));
    }

    if (!legatoWithPrevious && !continuesPrevious) {
      prevFormants = undefined;
      state = undefined;
    }
    if (isContinuation) {
      if (continuesPrevious) {
        const symbol = continuationSymbol;
        if (symbol === undefined) throw new Error("A continuation note must have a source phoneme");
        note = { ...note, phonemes: [symbol] };
      } else {
        prevFormants = undefined;
        state = undefined;
        note = { ...note, phonemes: [REST_PHONEME] };
      }
    }

    const accent = accentOffsets[ni];
    if (accent !== undefined) {
      note = { ...note, pitchAccent: accent };
    }
    const rendered = renderNote(
      note,
      noteVoice,
      lang,
      timing.tempoAt(noteTick),
      resolution,
      prevFormants,
      extraSamples,
      {
        sampleLength: Math.max(1, endSample - startSample),
        tickAtSample: (sample) => timing.tickAt((startSample + sample) / sr) - noteTick,
      },
      { state, headFadeSamples, tailFadeSamples, continuation: continuesPrevious },
    );
    prevFormants = rendered.finalFormants;
    state = rendered.state;
    if (isRestLyric(originalNote.lyric)) continuationSymbol = undefined;
    else if (!isContinuation || !continuesPrevious) continuationSymbol = continuationSource(note, lang);
    const { chunk } = rendered;
    chunk.startSample = startSample - extraSamples;
    const firstChannel = elementAt(chunk.data, 0);
    if (noteVoice.channels === 2 && chunk.data.length === 1) {
      chunk.data = [new Float32Array(firstChannel), new Float32Array(firstChannel)];
      chunk.channels = 2;
    }
    yield chunk;
    await new Promise((r) => setTimeout(r, 0));
    previousEndTick = noteTick + note.length;
    previousEndSample = endSample;
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

export async function renderScore(
  score: Score,
  voiceInput?: string | VoiceConfig,
  langId?: string,
  options: StreamScoreOptions = {},
): Promise<AudioChunk[]> {
  const chunks: AudioChunk[] = [];
  for await (const chunk of streamScore(score, voiceInput, langId, options)) chunks.push(chunk);
  return chunks;
}

export function mixChunks(chunks: AudioChunk[]): AudioChunk {
  return mixAudioChunks(chunks);
}
