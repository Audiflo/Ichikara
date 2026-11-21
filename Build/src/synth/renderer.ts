import type { AudioChunk, VoiceConfig, LanguageModule, Note, PhonemeDef, PitchBend, FormantTarget } from "../core/types";
import { LFGlottalSource } from "../core/dsp/oscillator";
import { FormantCascade, FormantFilter, interpolateFormants } from "../core/dsp/filter";
import { hashNote, mulberry32 } from "../core/rng";
import { elementAt } from "../core/validation";

const FORMANT_UPDATE_INTERVAL_MS = 5;

const PARALLEL_FILTER_COUNT = 3;

const BREATH_RESONATORS: ReadonlyArray<{ f: number; bw: number }> = [
  { f: 1800, bw: 1200 },
  { f: 3500, bw: 1800 },
];

const DEFAULT_RENDER_SEED = 0x6d2b79f5;
const DEFAULT_RENDER_SAMPLE_RATE = 44100;

/** Exact duration and musical position for rendering a note across tempo changes. */
export interface NoteTiming {
  sampleLength: number;
  tickAtSample(sample: number): number;
}
function formantUpdateInterval(sampleRate: number): number {
  return Math.max(1, Math.round((FORMANT_UPDATE_INTERVAL_MS / 1000) * sampleRate));
}

/** Mutable DSP state that can be carried across legato notes. */
export interface RenderState {
  glottal: LFGlottalSource;
  rng: () => number;
  cascade: FormantCascade;
  parallelFilters: FormantFilter[];
  breathFilters: FormantFilter[];
}

/** Cross-note fade lengths and the oscillator state to continue from. */
export interface RenderOptions {
  state?: RenderState | undefined;
  headFadeSamples?: number | undefined;
  tailFadeSamples?: number | undefined;
  continuation?: boolean | undefined;
}

/** Rendered audio plus the state needed to continue phase and filter history. */
export interface RenderResult {
  chunk: AudioChunk;
  finalFormants: FormantTarget[];
  phonemeStarts: number[];
  state: RenderState;
}

/** Allocate a deterministic synthesis state for one rendering run.
 *
 *  @param seed Seed shared by jitter, shimmer, and consonant noise.
 *  @param sampleRate Sample rate used to tune the breath resonators.
 *  @returns Fresh glottal, cascade, noise, and breath filter state.
 */
export function createRenderState(seed = DEFAULT_RENDER_SEED, sampleRate = DEFAULT_RENDER_SAMPLE_RATE): RenderState {
  const rng = mulberry32(seed);
  const glottal = new LFGlottalSource();
  glottal.seed(rng);
  const parallelFilters = Array.from({ length: PARALLEL_FILTER_COUNT }, () => new FormantFilter());
  for (const filter of parallelFilters) filter.setPassthrough();
  const breathFilters = BREATH_RESONATORS.map(({ f, bw }) => {
    const filter = new FormantFilter();
    filter.setResonator(f, bw, sampleRate);
    return filter;
  });
  return { glottal, rng, cascade: new FormantCascade(), parallelFilters, breathFilters };
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function midiToFrequency(noteNum: number): number {
  return 440 * Math.pow(2, (noteNum - 69) / 12);
}

function ticksToDuration(tickLen: number, tempo: number, resolution: number, sampleRate: number): number {
  return tickLen * (60 / (tempo * resolution)) * sampleRate;
}

const MIN_VOICED_TARGET_RATIO = 0.25;

function computeAutoGain(peak: number, voicedRatio: number, peakComp: number, volume: number, target: number): number {
  const volGain = volume * 0.01;
  if (peak === 0) return volGain;
  const levelRatio = Math.max(MIN_VOICED_TARGET_RATIO, Math.max(0, Math.min(1, voicedRatio)));
  const levelTarget = target * levelRatio;
  const exponent = Math.max(0, Math.min(1, peakComp * 0.01));
  const ratio = levelTarget / peak;
  const autoGain = Number.isFinite(ratio) ? Math.pow(ratio, exponent) : 1;
  const gain = autoGain * volGain;
  return Number.isFinite(gain) ? gain : volGain;
}

const OUTPUT_CEILING = 0.99;

const FLOAT32_REL_STEP = 2 ** -23;

const DEFAULT_NORMALIZE_TARGET = 0.5;

const OUTLIER_THRESHOLD_RATIO = 0.5;
const MAX_OUTLIER_FRACTION = 0.001;

/** Peak level with isolated transients excluded, so one click cannot set the note's gain. */
export function robustPeak(samples: Float32Array, peak: number): number {
  if (peak <= 0) return peak;
  const threshold = peak * OUTLIER_THRESHOLD_RATIO;
  const outlierLimit = Math.max(2, Math.floor(samples.length * MAX_OUTLIER_FRACTION));
  let outliers = 0;
  let next = 0;
  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    if (magnitude >= threshold) outliers++;
    else if (magnitude > next) next = magnitude;
  }
  return outliers <= outlierLimit ? Math.max(next, peak * 0.001) : peak;
}

function clampNormalizeTarget(requested: number | undefined): number {
  const value = requested ?? DEFAULT_NORMALIZE_TARGET;
  if (!Number.isFinite(value)) return DEFAULT_NORMALIZE_TARGET;
  return Math.max(0, Math.min(OUTPUT_CEILING, value));
}

function softLimit(x: number): number {
  if (Number.isNaN(x)) return 0;
  const magnitude = Math.abs(x);
  if (magnitude <= OUTPUT_CEILING) return x;
  if (!Number.isFinite(magnitude)) return x < 0 ? -1 : 1;
  const headroom = 1 - OUTPUT_CEILING;
  const limited = OUTPUT_CEILING + headroom * Math.tanh((magnitude - OUTPUT_CEILING) / headroom);
  return x < 0 ? -limited : limited;
}

function interpolatePitchBend(bend: PitchBend | undefined, tickPos: number): number {
  if (!bend || bend.ticks.length === 0) return 0;
  if (tickPos <= elementAt(bend.ticks, 0)) return elementAt(bend.values, 0);
  const last = bend.ticks.length - 1;
  if (tickPos >= elementAt(bend.ticks, last)) return elementAt(bend.values, last);
  for (let i = 0; i < last; i++) {
    const start = elementAt(bend.ticks, i);
    const end = elementAt(bend.ticks, i + 1);
    if (tickPos >= start && tickPos < end) {
      const t = (tickPos - start) / (end - start);
      const value = elementAt(bend.values, i);
      return value + t * (elementAt(bend.values, i + 1) - value);
    }
  }
  return elementAt(bend.values, last);
}

const DEFAULT_CONSONANT_DURATION_SEC = 0.06;

const MAX_CONSONANT_FRACTION = 0.4;

const DIPHTHONG_WEIGHT = 1.3;

const FINAL_PHONEME_WEIGHT = 1.2;

const PLOSIVE_CLOSURE_FRACTION = 0.8;

const AFFRICATE_CLOSURE_FRACTION = 0.55;

const AFFRICATE_VOICED_CLOSURE_FRACTION = 0.4;

const RELEASE_ATTACK_SEC = 0.004;

function isConsonantLike(ph: PhonemeDef): boolean {
  return ph.type === "consonant" || ph.type === "silence";
}

function distributeSamples(weights: Float64Array, total: number): Int32Array {
  const n = weights.length;
  const out = new Int32Array(n);
  if (n === 0) return out;

  let sum = 0;
  for (const weight of weights) if (weight > 0) sum += weight;

  if (sum <= 0) {
    const each = Math.floor(total / n);
    const leftover = total - each * n;
    for (let i = 0; i < n; i++) out[i] = each + (i < leftover ? 1 : 0);
    return out;
  }

  const remainders: Array<{ index: number; frac: number }> = [];
  let assigned = 0;
  for (const [i, weight] of weights.entries()) {
    const exact = (total * Math.max(0, weight)) / sum;
    const whole = Math.floor(exact);
    out[i] = whole;
    assigned += whole;
    remainders.push({ index: i, frac: exact - whole });
  }

  remainders.sort((a, b) => b.frac - a.frac);
  let leftover = total - assigned;
  for (let k = 0; leftover > 0; k = (k + 1) % n, leftover--) {
    const { index } = elementAt(remainders, k);
    out[index] = elementAt(out, index) + 1;
  }
  return out;
}

/** Allocate the note's samples across its phonemes.
 *
 *  Consonants and silences get their nominal length, collectively capped to
 *  `MAX_CONSONANT_FRACTION` of the note; vowels share what is left, weighted so
 *  diphthongs and the final phoneme receive slightly more. A note with no vowels
 *  spreads itself across the consonants instead of dumping the tail on the last
 *  one. The result always sums to `noteLenSamp`.
 *
 *  @param phonemes Phoneme sequence for the note, in singing order.
 *  @param noteLenSamp Total samples the note occupies, tail included.
 *  @param sr Voice sample rate, used to convert nominal durations to samples.
 *  @returns Per-phoneme sample counts, non-negative and summing to
 *   `noteLenSamp`. When the note holds fewer samples than phonemes, the
 *   surplus phonemes receive zero rather than a negative count.
 */
export function computePhonemeDurations(phonemes: PhonemeDef[], noteLenSamp: number, sr: number): Int32Array {
  const n = phonemes.length;
  const total = Math.max(0, Math.round(noteLenSamp));
  if (n === 0) return new Int32Array(0);

  const consNominal = new Float64Array(n);
  let consSum = 0;
  for (const [i, phoneme] of phonemes.entries()) {
    if (isConsonantLike(phoneme)) {
      const nominal = (phoneme.defaultDuration ?? DEFAULT_CONSONANT_DURATION_SEC) * sr;
      consNominal[i] = nominal;
      consSum += nominal;
    }
  }

  const consBudget = Math.min(consSum, total * MAX_CONSONANT_FRACTION);
  if (consSum > consBudget && consSum > 0) {
    const scale = consBudget / consSum;
    for (const [i, nominal] of consNominal.entries()) if (nominal > 0) consNominal[i] = nominal * scale;
  }

  const vowelWeight = new Float64Array(n);
  let vowelSum = 0;
  for (const [i, phoneme] of phonemes.entries()) {
    if (isConsonantLike(phoneme)) continue;
    const weight = (phoneme.type === "diphthong" ? DIPHTHONG_WEIGHT : 1) * (i === n - 1 ? FINAL_PHONEME_WEIGHT : 1);
    vowelWeight[i] = weight;
    vowelSum += weight;
  }

  const weights = new Float64Array(n);
  if (vowelSum > 0) {
    const vowelBudget = Math.max(0, total - consBudget);
    for (const [i, phoneme] of phonemes.entries()) {
      weights[i] = isConsonantLike(phoneme) ? elementAt(consNominal, i) : (vowelBudget * elementAt(vowelWeight, i)) / vowelSum;
    }
  } else {
    for (const [i, nominal] of consNominal.entries()) {
      weights[i] = consSum > 0 ? (nominal * total) / consSum : 0;
    }
  }

  return distributeSamples(weights, total);
}

function isVoicedContinuant(ph: PhonemeDef): boolean {
  return (
    ph.type !== "silence" &&
    ph.voiced !== false &&
    ph.consonantType !== "plosive" &&
    ph.consonantType !== "affricate" &&
    ph.consonantType !== "fricative"
  );
}

function getPhonemeEnvelopeSamples(ph: PhonemeDef, sr: number, prev?: PhonemeDef, next?: PhonemeDef): { attack: number; decay: number } {
  if (ph.type === "silence") return { attack: 0, decay: 0 };
  if (ph.consonantType === "plosive") {
    return { attack: Math.round(0.002 * sr), decay: Math.round(0.015 * sr) };
  }
  const joinedPrev = prev !== undefined && isVoicedContinuant(prev) && isVoicedContinuant(ph);
  const joinedNext = next !== undefined && isVoicedContinuant(ph) && isVoicedContinuant(next);
  return { attack: joinedPrev ? 0 : Math.round(0.005 * sr), decay: joinedNext ? 0 : Math.round(0.003 * sr) };
}

export function renderPhonemes(
  phonemes: PhonemeDef[],
  note: Note,
  voice: VoiceConfig,
  tempo: number,
  resolution: number,
  prevFormants?: FormantTarget[],
  extraSamples = 0,
  timing?: NoteTiming,
  options: RenderOptions = {},
): RenderResult {
  const sr = voice.sampleRate;
  const baseF0 = midiToFrequency(note.noteNum);
  const seedBase = hashNote(note, `${tempo}:${resolution}:${phonemes.map((p) => p.symbol).join(",")}`);
  const state = options.state ?? createRenderState(seedBase, sr);
  const { glottal, rng, cascade, parallelFilters, breathFilters } = state;

  const nominalLen = timing?.sampleLength ?? Math.max(1, Math.round(ticksToDuration(note.length, tempo, resolution, sr)));
  const noteLen = Math.max(1, nominalLen + Math.max(0, extraSamples));
  const fadeBudget = Math.max(0, noteLen - 1);
  let headFadeSamples = Math.min(Math.max(0, Math.round(options.headFadeSamples ?? 0)), fadeBudget);
  let tailFadeSamples = Math.min(Math.max(0, Math.round(options.tailFadeSamples ?? 0)), fadeBudget);
  if (headFadeSamples + tailFadeSamples > fadeBudget && fadeBudget > 0) {
    const scale = fadeBudget / (headFadeSamples + tailFadeSamples);
    headFadeSamples = Math.floor(headFadeSamples * scale);
    tailFadeSamples = fadeBudget - headFadeSamples;
  }
  const tailFadeStart = noteLen - 1 - tailFadeSamples;
  const fScale = voice.formant.scale;
  const fShift = voice.formant.shift;

  const applyVoice = (targets: { f: number; bw: number }[]) =>
    targets.map((t) => ({ f: t.f * fScale * Math.pow(2, fShift / 12), bw: t.bw * voice.formant.bandwidth }));

  const DEFAULT_FORMANTS = applyVoice([
    { f: 500, bw: 120 },
    { f: 1500, bw: 180 },
    { f: 2500, bw: 220 },
    { f: 3500, bw: 350 },
    { f: 4500, bw: 500 },
  ]);

  if (phonemes.length === 0) {
    const chunk: AudioChunk = {
      data: Array.from({ length: voice.channels }, () => new Float32Array(noteLen)),
      sampleRate: sr,
      startSample: 0,
      channels: voice.channels,
    };
    return { chunk, finalFormants: DEFAULT_FORMANTS, phonemeStarts: [], state };
  }

  const mono = new Float32Array(noteLen);
  const vibOverride = note.vibratoOverride ?? {};
  const vibRate = vibOverride.rate ?? voice.vibrato.rate;
  const vibDepth = vibOverride.depth ?? voice.vibrato.depth;
  const vibAttackSamp = Math.round((vibOverride.attack ?? voice.vibrato.attack) * sr);

  const transitionLen = Math.round(0.03 * sr);
  const fadeLen = Math.round(0.003 * sr);
  const boundaryFadeLen = Math.round(0.002 * sr);

  const velNorm = Math.max(0, Math.min(1, (note.velocity ?? 100) / 127));
  const velBreathScale = 0.5 + velNorm * 0.8;
  const velShimmerScale = 1 - velNorm * 0.6;
  const velAspirationScale = 0.6 + velNorm * 0.6;
  const intensity = note.intensity ?? 100;
  const intensityScale = intensity / 100;

  const phDurations = computePhonemeDurations(phonemes, noteLen, sr);
  const piAtSample = new Int32Array(noteLen);
  const phSampleCounts = new Int32Array(phonemes.length);
  {
    let pos = 0;
    for (let pi = 0; pi < phonemes.length; pi++) {
      const end = Math.min(pos + elementAt(phDurations, pi), noteLen);
      phSampleCounts[pi] = end - pos;
      for (let i = pos; i < end; i++) {
        piAtSample[i] = pi;
      }
      pos = end;
    }
    while (pos < noteLen) {
      piAtSample[pos] = phonemes.length - 1;
      phSampleCounts[phonemes.length - 1] = elementAt(phSampleCounts, phonemes.length - 1) + 1;
      pos++;
    }
  }

  const phEnvelopes = phonemes.map((ph, pi) => {
    const envelope = getPhonemeEnvelopeSamples(
      ph,
      sr,
      pi > 0 ? elementAt(phonemes, pi - 1) : undefined,
      pi < phonemes.length - 1 ? elementAt(phonemes, pi + 1) : undefined,
    );
    if (pi === 0 && (headFadeSamples > 0 || options.continuation)) envelope.attack = 0;
    if (pi === phonemes.length - 1 && tailFadeSamples > 0) envelope.decay = 0;
    return envelope;
  });

  let prevPi = -1;
  let phSegStart = 0;
  let overallPeak = 1e-10;
  let voicedSamples = 0;
  let lastFormantUpdateSample = -formantUpdateInterval(sr);

  for (let i = 0; i < noteLen; i++) {
    const pi = elementAt(piAtSample, i);
    const cp = elementAt(phonemes, pi);

    if (pi !== prevPi) {
      phSegStart = i;
      prevPi = pi;
      lastFormantUpdateSample = i - formantUpdateInterval(sr);
      const noiseTargets = cp.noise?.formantShaping ?? [];
      for (const [fi, filter] of parallelFilters.entries()) {
        const target = noiseTargets[fi];
        if (target) {
          const at = elementAt(applyVoice([target]), 0);
          filter.setResonator(at.f, at.bw, sr);
        } else {
          filter.setPassthrough();
        }
      }
    }

    const vibGain = i < vibAttackSamp ? i / vibAttackSamp : 1;
    const pitchTick = note.pitchBend && timing ? timing.tickAtSample(Math.max(0, i - extraSamples)) : (i / noteLen) * note.length;
    const pitchBendSemitones = interpolatePitchBend(note.pitchBend, pitchTick);
    const vibCents = Math.sin((2 * Math.PI * vibRate * i) / sr) * vibDepth * vibGain;
    const accentCents = (note.pitchAccent ?? 0) * 100;
    const f0 = baseF0 * Math.pow(2, (pitchBendSemitones * 100 + vibCents + accentCents) / 1200);
    const previousFormants = pi === 0 && prevFormants ? prevFormants : (phonemes[Math.max(0, pi - 1)] ?? cp).formants;
    const segPos = i - phSegStart;
    const phDur = elementAt(phSampleCounts, pi);
    const tt = Math.min(1, segPos / Math.max(1, transitionLen));

    if (i - lastFormantUpdateSample >= formantUpdateInterval(sr)) {
      lastFormantUpdateSample = i;
      const ft = previousFormants ?? [];
      const ct = cp.formants ?? ft;
      if (tt < 1 && ft.length && ct.length) {
        cascade.setFormants(
          interpolateFormants(applyVoice(ft), applyVoice(ct), tt),
          sr,
          cp.antiformants ? applyVoice(cp.antiformants) : undefined,
        );
      } else if (cp.type === "diphthong" && cp.endFormants && cp.endFormants.length > 0) {
        const sweepT = Math.min(1, (segPos - transitionLen) / Math.max(1, phDur - transitionLen));
        const swept = interpolateFormants(applyVoice(ct), applyVoice(cp.endFormants), sweepT);
        cascade.setFormants(swept, sr, cp.antiformants ? applyVoice(cp.antiformants) : undefined);
      } else if (ct.length) {
        cascade.setFormants(applyVoice(ct), sr, cp.antiformants ? applyVoice(cp.antiformants) : undefined);
      } else {
        cascade.setFormants(DEFAULT_FORMANTS, sr);
      }
    }

    const gSample = glottal.nextSample({ f0, sampleRate: sr, ...voice.glottal, shimmer: (voice.glottal.shimmer ?? 0) * velShimmerScale });
    const voiced = cp.type !== "silence" && cp.voiced !== false;
    if (voiced) voicedSamples++;
    const nSample = rng() * 2 - 1;

    const noiseFadeIn = Math.min(1, segPos / Math.max(1, fadeLen));
    const noiseFadeOut = Math.max(0, Math.min(1, (phDur - segPos - 1) / Math.max(1, fadeLen)));
    let noiseEnv = Math.min(noiseFadeIn, noiseFadeOut);
    if (cp.consonantType === "plosive" || cp.consonantType === "affricate") {
      const closureFrac =
        cp.consonantType === "affricate"
          ? cp.voiced
            ? AFFRICATE_VOICED_CLOSURE_FRACTION
            : AFFRICATE_CLOSURE_FRACTION
          : PLOSIVE_CLOSURE_FRACTION;
      const closureLen = Math.min(Math.max(0, phDur - 1), Math.round(phDur * closureFrac));
      const relPos = segPos - closureLen;
      if (relPos < 0) {
        noiseEnv = 0;
      } else {
        const relLen = Math.max(1, phDur - closureLen);
        const attackLen = Math.min(relLen, Math.max(1, Math.round(RELEASE_ATTACK_SEC * sr)));
        const rise = relPos < attackLen ? relPos / attackLen : 1;
        const decay = 1 - (relPos - attackLen) / Math.max(1, relLen - attackLen);
        noiseEnv = Math.min(noiseFadeOut, rise * Math.max(0, decay) ** 2);
      }
    }

    const glottalSignal = voiced ? gSample : 0;
    let noiseSignal = 0;
    if (cp.type === "consonant" && cp.noise) {
      if (cp.noise.formantShaping && cp.noise.formantShaping.length > 0) {
        for (let fi = 0; fi < Math.min(parallelFilters.length, cp.noise.formantShaping.length); fi++) {
          noiseSignal += elementAt(parallelFilters, fi).processSample(nSample);
        }
      } else {
        noiseSignal = nSample;
      }
      noiseSignal *= cp.noise.amplitude * noiseEnv * velBreathScale;
    }
    let breathSignal = 0;
    if (cp.type === "vowel" || cp.type === "diphthong") {
      let breath = 0;
      for (const bf of breathFilters) breath += bf.processSample(nSample);
      breathSignal = breath * voice.glottal.aspiration * noiseEnv * velAspirationScale;
    }

    const phEnv = elementAt(phEnvelopes, pi);
    let env = 1;
    if (phEnv.attack > 0 && segPos < phEnv.attack) {
      const t = segPos / phEnv.attack;
      env *= t * t * (3 - 2 * t);
    }
    if (phEnv.decay > 0 && segPos >= phDur - phEnv.decay) {
      const t = (phDur - segPos) / phEnv.decay;
      env *= t * t * (3 - 2 * t);
    }
    const cascaded = cascade.processSample(glottalSignal);
    const voicedSignal = cp.type === "silence" ? 0 : cascaded;
    const startFade =
      headFadeSamples > 0
        ? smoothstep01(i / headFadeSamples)
        : options.continuation
          ? 1
          : i < boundaryFadeLen
            ? Math.min(1, i / Math.max(1, boundaryFadeLen))
            : 1;
    const endFade = tailFadeSamples > 0 ? 1 - smoothstep01((i - tailFadeStart) / tailFadeSamples) : 1;
    const enveloped = (voicedSignal + noiseSignal + breathSignal) * env * startFade * endFade;
    mono[i] = enveloped;
    if (Math.abs(enveloped) > overallPeak) overallPeak = Math.abs(enveloped);
  }

  const voicedRatio = noteLen > 0 ? voicedSamples / noteLen : 1;
  const volume = voice.volume ?? 100;
  const peakComp = voice.peakComp ?? 100;
  const target = clampNormalizeTarget(voice.normalizeTarget);
  const levelPeak = robustPeak(mono, overallPeak);
  const gain = computeAutoGain(levelPeak, voicedRatio, peakComp, volume, target * (1 - FLOAT32_REL_STEP)) * intensityScale;
  for (let i = 0; i < noteLen; i++) {
    mono[i] = softLimit(elementAt(mono, i) * gain);
  }

  const lastPh = elementAt(phonemes, phonemes.length - 1);
  let finalFormants: FormantTarget[];
  if (lastPh.type === "diphthong" && lastPh.endFormants && lastPh.endFormants.length > 0) {
    finalFormants = applyVoice(lastPh.endFormants);
  } else if (lastPh.formants && lastPh.formants.length > 0) {
    finalFormants = applyVoice(lastPh.formants);
  } else {
    finalFormants = DEFAULT_FORMANTS;
  }

  const phonemeStarts = new Array<number>(phonemes.length);
  let acc = 0;
  for (let pi = 0; pi < phonemes.length; pi++) {
    phonemeStarts[pi] = acc;
    acc += elementAt(phSampleCounts, pi);
  }

  const chunk: AudioChunk =
    voice.channels === 2
      ? { data: [new Float32Array(mono), new Float32Array(mono)], sampleRate: sr, startSample: 0, channels: 2 }
      : { data: [mono], sampleRate: sr, startSample: 0, channels: 1 };
  return { chunk, finalFormants, phonemeStarts, state };
}

export function renderNote(
  note: Note,
  voice: VoiceConfig,
  lang: LanguageModule,
  tempo: number,
  resolution: number,
  prevFormants?: FormantTarget[],
  extraSamples = 0,
  timing?: NoteTiming,
  options: RenderOptions = {},
): RenderResult {
  const rawPhonemes = note.phonemes ?? lang.lyricToPhonemes(note.lyric);
  const phonemeSymbols = note.phonemes !== undefined && lang.expandPhonemes ? lang.expandPhonemes(rawPhonemes) : rawPhonemes;
  const phonemes = phonemeSymbols
    .map((s) => {
      const p = lang.phonemes.get(s);
      if (!p) console.warn(`renderNote: missing phoneme "${s}" in lyric "${note.lyric}"`);
      return p;
    })
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  if (note.lyric.includes("＠") && phonemes[0]?.type === "consonant") {
    phonemes.shift();
  }

  return renderPhonemes(phonemes, note, voice, tempo, resolution, prevFormants, extraSamples, timing, options);
}
