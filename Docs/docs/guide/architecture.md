---
title: "Architecture"
description: "How the Ichikara library is organised"
---

## Module Layout

The library is organised into four layers:

```text
src/
  core/              - Data types + low-level DSP primitives
    types.ts         - VoiceConfig, Note, Score, PhonemeDef, etc.
    dsp/             - LF glottal source, formant filters, noise, envelope, WAV
  langs/             - Language modules (G2P, phoneme inventories)
    index.ts         - Registry + lookup
    english.ts       - ARPAbet + CMUDict G2P
    japanese.ts      - Hiragana/romaji + EDICT2 kanji G2P
    mandarin.ts      - Pinyin syllable decomposition
    alias.ts         - Cross-language canonical phoneme mapping
  synth/             - Rendering pipeline
    renderer.ts      - Single-note renderer
    stream.ts        - Score-level streaming + mixing
  voices/            - Voice presets and configuration
    index.ts         - chitoseChika, chitoseSho, chitoseRen, buildVoice, scaleVoice
  player/            - Web Audio playback
    stream-player.ts - AsyncGenerator consumption + AudioContext scheduling
  import/            - File import (utaformatix-ts based)
    ufdata.ts        - ufDataToScore, importScoreFromFile, importScoreFromBytes
  export/            - File export (utaformatix-ts based)
    ufdata.ts        - scoreToUfData, exportScoreToBytes, exportScoreToBlob, downloadScore
```

## Data Flow

```mermaid
flowchart TD
    F[File: UST, MIDI, etc.] -->|importScoreFromFile<br/>importScoreFromBytes| S[Score]
    S -->|renderScore / streamScore| A["AudioChunk[]"]
    S -.-> VC[VoiceConfig]
    S -.-> LM[LanguageModule]
    A -->|encodeWav| W[WAV file]
    A -->|StreamPlayer.play| P[Audio output]
```

## Design Decisions

- **DSP state follows legato phrases**: `createRenderState` owns the `LFGlottalSource`, `FormantCascade`, and noise filters. `streamScore` reuses that state across adjacent notes and small gaps so oscillator phase and filter history stay continuous, then blends overlapping chunks with complementary fades. Non-legato notes start from fresh state.
- **Lazy G2P loading**: utaformatix-ts is loaded on first import/export call, keeping the initial bundle small.
- **No Web Audio dependency in the core**: The synth layer produces `AudioChunk` objects with no DOM or AudioContext dependency. Only `StreamPlayer` touches the Web Audio API.
- **Platform-agnostic types**: `AudioChunk` uses `Float32Array` arrays, compatible with both Node.js and browser environments.
