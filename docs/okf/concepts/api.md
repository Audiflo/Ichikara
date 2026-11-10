---
type: api
title: "API Reference"
description: "Public types and functions for synthesis, projects, playback, and score conversion."
source: "https://audiflo.github.io/Ichikara/docs/api/"
path: /api/
updated: 2026-11-10
okf:
  generated_by: "@docmd/plugin-okf"
  generated_at: "2026-11-10T13:24:54.238Z"
---
---
title: "API Reference"
description: "Public types and functions for synthesis, projects, playback, and score conversion."
---

Import these types and functions from `@audiflo/ichikara`.

## Native projects

See [Native projects](projects.md) for document structure and examples.

| Export | Description |
| --- | --- |
| `Project`, `VocalTrack`, `VocalPart`, `ProjectNote` | Song document types with stable IDs |
| `IdFactory`, `VoiceParameters`, `MeterEvent` | Host IDs, per-track voice controls, and meter changes |
| `createProject`, `addTrack`, `addPart` | Construct a song |
| `projectFromScore` | Wrap a single score in a native project |
| `validateProject`, `parseProject`, `serializeProject` | Validate and round-trip native JSON |
| `TempoMap`, `MeterMap` | Convert ticks, seconds, bars, and beats |
| `streamProject` | Render placed tracks and parts with a stereo mix |
| `importProjectFromFile`, `exportProjectToBytes` | Whole-song score conversion |
| `ufDataToProject`, `projectToUfData` | Direct UtaFormatix conversion |

## Core Types

| Export                | Description                                                             |
|-----------------------|-------------------------------------------------------------------------|
| `VoiceConfig`         | Complete voice configuration (glottal, formant, vibrato, output format) |
| `GlottalConfig`       | LF glottal pulse source parameters                                      |
| `FormantConfig`       | Vocal-tract formant transformation                                      |
| `VibratoConfig`       | Pitch vibrato modulation                                                |
| `FormantTarget`       | Single formant centre frequency + bandwidth                             |
| `NoiseConfig`         | Noise source for consonant generation                                   |
| `PhonemeDef`          | Full acoustic definition of a phoneme                                   |
| `Note`                | A single note with lyric, pitch, timing, and overrides                  |
| `Score`               | Complete musical score (tempos + notes)                                 |
| `TempoEvent`          | Tempo change event                                                      |
| `AudioChunk`          | Processed audio segment with timeline position                          |
| `LanguageModule`      | Language module interface                                               |
| `PitchBend`           | Pitch-bend envelope                                                     |
| `GlottalSourceParams` | Runtime glottal source parameters                                       |

## DSP Primitives

| Export                   | Description                                  |
|--------------------------|----------------------------------------------|
| `LFGlottalSource`        | LF glottal pulse source (stateful)           |
| `FormantFilter`          | Biquad resonator / anti-resonator            |
| `FormantCascade`         | Cascaded formant filter bank                 |
| `interpolateFormants`    | Smooth interpolation between formant targets |
| `NoiseSource`            | White noise generator                        |
| `shapeNoiseWithFormants` | Filter noise through formant resonators      |
| `applyAmplitudeEnvelope` | Attack/release envelope shaping              |
| `mixBuffers`             | Additive buffer mixing                       |
| `encodeWav`              | Encode AudioChunks as WAV                    |

## Synthesis

| Export        | Description                     |
|---------------|---------------------------------|
| `renderNote`  | Render a single note            |
| `renderScore` | Render an entire score          |
| `streamScore` | Stream score as async generator |
| `mixChunks`   | Mix overlapping AudioChunks     |

## Language

| Export                | Description                           |
|-----------------------|---------------------------------------|
| `getLanguage`         | Look up language module by ID         |
| `registerLanguage`    | Register a custom language module     |
| `japanese`            | Japanese language module              |
| `english`             | English language module               |
| `mandarin`            | Mandarin Chinese language module      |
| `toCanonical`         | Map phoneme symbol to canonical IPA   |
| `sequenceToCanonical` | Map phoneme sequence to canonical IPA |

## Voice

| Export          | Description                             |
|-----------------|-----------------------------------------|
| `getVoice`        | Look up registered voice by name        |
| `registerVoice`   | Register a custom voice config          |
| `chitoseChika`    | Chitose Chika, the female voice          |
| `chitoseSho`      | Chitose Sho, the male voice              |
| `chitoseRen`      | Chitose Ren, the neutral voice           |
| `chitoseVoices`   | All named voices, in UI order           |
| `buildVoice`      | Build voice from partial overrides      |
| `scaleVoice`      | Scale voice along perceptual dimensions |

## Playback

| Export         | Description                                       |
|----------------|---------------------------------------------------|
| `StreamPlayer` | Web Audio streaming player                        |
| `PlayerState`  | Player state type ("idle" / "playing" / "paused") |
| `PlayerEvent`  | Player event union type                           |
| `PlayOptions`  | Playback options                                  |

## Import / Export

| Export                 | Description                                          |
|------------------------|------------------------------------------------------|
| `ufDataToScore`        | Convert UfData (utaformatix-3 intermediate) to Score |
| `importScoreFromFile`  | Import score from a File object                      |
| `importScoreFromBytes` | Import score from raw bytes                          |
| `ImportOptions`        | Import options                                       |
| `UfData`               | UTAU Format Data structure                           |
| `scoreToUfData`        | Convert Score to UfData                              |
| `exportScoreToBytes`   | Export score as Uint8Array                           |
| `exportScoreToBlob`    | Export score as Blob                                 |
| `exportScoreToUrl`     | Export score as blob URL                             |
| `downloadScore`        | Trigger browser download                             |
| `ExportOptions`        | Export options                                       |
