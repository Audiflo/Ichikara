---
title: "Native projects"
description: "Create, validate, save, and render multi-track Ichikara songs."
---

# Native projects

`Project` is the document behind an `.ichi` file. It contains the song's timing,
tracks, parts, notes, voices, and mix settings. It does not contain file handles,
audio resources, panel sizes, or other host-specific state.

## Create a song

IDs come from the host and must be unique throughout the document. Pass a
function that calls `crypto.randomUUID()` rather than an unbound browser method.

```typescript
import { createProject, addTrack, addPart, chitoseChika, serializeProject } from "@audiflo/ichikara";

const id = () => crypto.randomUUID();
const project = createProject("Evening", id);
const track = addTrack(project, "Lead", chitoseChika, "jp", id);
const part = addPart(track, "Verse", 0, 1920, id);

part.notes.push({
  id: id(),
  tick: 0,
  length: 960,
  noteNum: 64,
  lyric: "あ",
  intensity: 100,
  pitchBend: { ticks: [0, 240, 960], values: [-0.5, 0, 0] },
});

const source = serializeProject(project);
```

`createProject` starts at 120 BPM, 4/4, and 480 ticks per quarter note.
`addTrack` and `addPart` append to their parent and return the new object.
`addTrack` clones the supplied base voice so tracks can be edited independently.

## Coordinates and fields

| Field                      | Meaning                                               |
| -------------------------- | ----------------------------------------------------- |
| `project.tempos`           | Absolute tick positions and BPM values                |
| `project.meters`           | Absolute tick positions, numerators, and denominators |
| `track.voice`              | Stored base voice configuration                       |
| `track.parameters`         | Per-track `scaleVoice` parameters                     |
| `track.gain`, `track.pan`  | Linear gain and pan from -1 (left) to 1 (right)       |
| `track.mute`, `track.solo` | Track playback and render selection                   |
| `part.tick`, `part.length` | Absolute start and duration in project ticks          |
| `note.tick`, `note.length` | Start relative to the part, and duration              |
| `note.pitchBend`           | Note-relative ticks and semitone offsets              |

`ProjectNote` extends `Note` with a required stable `id` and `tick`. A note's
absolute song position is `part.tick + note.tick`. Use `TempoMap` to convert
ticks and seconds, and `MeterMap` for bar/beat positions and grid lines.

## Validate and save

`serializeProject(project)` validates the document and returns JSON with a final
newline. `parseProject(source)` reads JSON and validates its fields and version.
Both throw for invalid documents; handle those errors at your file or UI boundary.
`validateProject(value)` also accepts unknown data and narrows it to `Project`.

The filename extension is `.ichi`; the JSON discriminator remains
`format: "ichikara"` and `version: 1`. Changing the extension does not change the
document schema. The editor still accepts the older `.ichikara` extension.

## Render the song

```typescript
import { streamProject, encodeWav, type AudioChunk } from "@audiflo/ichikara";

const chunks: AudioChunk[] = [];
for await (const chunk of streamProject(project, 48000)) {
  chunks.push(chunk);
}
const wav = encodeWav(chunks);
```

`streamProject` yields stereo chunks in absolute sample order. It applies part
placement, track voice parameters, mute/solo, gain, and equal-power pan. The
default sample rate is 44100 Hz. Chunks may overlap; `encodeWav` mixes them.
An early iterator return closes the part producers. Validation, language, and
synthesis errors propagate to the caller.

## Convert other formats

`importProjectFromFile(file, language, id)` imports every track from a supported
score file. Each imported track gets a native part and host-generated IDs.
`exportProjectToBytes(project, { format: "ustx" })` exports all tracks using
absolute note positions.

For direct conversion, use `ufDataToProject(data, language, id)` and
`projectToUfData(project, options)`. Region boundaries, native voices, mix
controls, and some expression fields are not represented by UtaFormatix data.
Keep an `.ichi` copy when converting. See [Import / Export](import-export.md).
