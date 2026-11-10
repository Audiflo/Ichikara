---
title: "Ichikara"
description: "A OneVoice song editor and TypeScript singing-synthesis library."
---

::: hero layout:split glow:true

<!-- markdownlint-disable MD025 -->

# Ichikara

Write and arrange songs in the browser, or synthesize singing from your own
TypeScript app. Ichikara generates voices from parameters rather than recorded
voicebanks.

::: tag "OneVoice Editor"
::: tag "LF Glottal"
::: tag "Cross-Language"

<!--markdownlint-disable MD034-->

::: button "Open Editor" external:https://audiflo.github.io/Ichikara icon:play
::: button "Quick Start" ./getting-started/quickstart.md icon:code

<!--markdownlint-disable MD034-->

::: button "GitHub" external:https://github.com/Audiflo/Ichikara icon:github

== side

::: card "OneVoice"
Choose a Chitose voice, then adjust its gender, breathiness, brightness, tension,
and vibrato. Each vocal track has its own voice and language. The same controls
are available through `scaleVoice()` in the library.
:::
:::

![Vocal tracks, piano-roll notes, and expression editing in Ichikara](assets/images/editor.png)

## Song editor

Arrange vocal parts across tracks, edit lyrics and phonemes, draw pitch curves,
and set intensity or velocity with note-length bars. Resize the workspace to
fit your song and follow playback in page or smooth mode.

Save as `.ichi` to retain voices, expression, parts, and mix settings. Export WAV
for audio or USTX to continue in another editor.

::: button "Editor Guide" ./guide/editor.md icon:music

## Features

::: grids
::: grid
::: card "LF Glottal Source" icon:waveform
Liljencrants-Fant glottal pulses with jitter, shimmer, aspiration noise, and DC
blocking. Control open quotient, speed quotient, tenseness, and power.
:::
:::

::: grid
::: card "Cascaded Formant Filter" icon:combine
Resonators and anti-resonators model the vocal tract, interpolating between
phoneme targets as the voice moves through a lyric.
:::
:::

::: grid
::: card "Three Languages" icon:globe
Japanese hiragana, romaji, and kanji; English text with CMUDict; and Mandarin
pinyin. Add another language through `registerLanguage`.
:::
:::

::: grid
::: card "Streaming Playback" icon:wind
Play chunks as they render through Web Audio. Native projects include track
placement, mute/solo, gain, and stereo pan.
:::
:::

::: grid
::: card "File Import / Export" icon:file-up
Read and write UST, USTX, VPR, VSQX, MIDI, MusicXML, and other score formats through
UtaFormatix. Keep an `.ichi` copy for native settings and region boundaries.
:::
:::

::: grid
::: card "OneVoice System" icon:sliders
Start with Chitose Chika, Sho, or Ren. Use the editor's voice controls or
`buildVoice()` and `scaleVoice()` to change the sound.
:::
:::
:::

## Quick Example

::: tabs

== tab "Node.js"

```typescript
import { writeFileSync } from "node:fs";
import { renderScore, chitoseChika, encodeWav, type Score } from "@audiflo/ichikara";

const score: Score = {
  tempos: [{ tick: 0, tempo: 120 }],
  resolution: 480,
  notes: [
    { lyric: "こ", noteNum: 60, length: 480 },
    { lyric: "ん", noteNum: 62, length: 480 },
    { lyric: "に", noteNum: 64, length: 480 },
    { lyric: "ち", noteNum: 65, length: 480 },
    { lyric: "は", noteNum: 67, length: 960 },
  ],
};

const chunks = await renderScore(score, chitoseChika, "jp");
writeFileSync("hello.wav", Buffer.from(encodeWav(chunks)));
```

== tab "Browser"

Call playback from a user action, using the score from the Node.js tab:

```typescript
import { streamScore, chitoseChika, StreamPlayer, type Score } from "@audiflo/ichikara";

const player = new StreamPlayer();

async function playPhrase(score: Score): Promise<void> {
  await player.play(streamScore(score, chitoseChika, "jp"));
}
```

== tab "Custom Voice"

Pass this voice to `renderScore` or `streamScore` with your score and language:

```typescript
import { buildVoice, scaleVoice } from "@audiflo/ichikara";

const brightAlto = scaleVoice(
  buildVoice({
    name: "Bright Alto",
    formant: { scale: 1.25, shift: 2, bandwidth: 1.0 },
  }),
  {
    gender: 0.3,
    breathiness: 0.2,
    vibratoAmount: 0.8,
  },
);
```

:::

## Installation

```sh
npm install @audiflo/ichikara
```

## Next Steps

::: grids
::: grid

### Getting Started

Edit a song in the browser or render a phrase with the library.

::: button "Song Editor" ./guide/editor.md icon:music
::: button "Quick Start" ./getting-started/quickstart.md icon:play
::: button "Installation" ./getting-started/installation.md icon:download
:::
::: grid

### Learn the Engine

How notes, phonemes, and voice parameters become audio.

::: button "Core Concepts" ./getting-started/concepts.md icon:book
::: button "Architecture" ./guide/architecture.md icon:box
:::
::: grid

### Reference

Document types, synthesis functions, and voice settings.

::: button "API Reference" ./api/ icon:code
::: button "Native Projects" ./api/projects.md icon:folder
::: button "Voice Config" ./api/voice-config.md icon:sliders
:::
:::
