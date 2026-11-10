---
type: api
title: "Import / Export"
description: "Native projects and score conversion through UtaFormatix."
source: "https://audiflo.github.io/Ichikara/docs/api/import-export/"
path: /api/import-export/
updated: 2026-11-10
okf:
  generated_by: "@docmd/plugin-okf"
  generated_at: "2026-11-10T13:40:42.164Z"
---
---
title: "Import / Export"
description: "Native projects and score conversion through UtaFormatix."
---

## Native projects and whole songs

Use `parseProject` and `serializeProject` for `.ichi` files. They retain native
voices, mix settings, region boundaries, and expression. See
[Native projects](projects.md) for examples.

For other score formats, `importProjectFromFile(file, language, id)` reads all
tracks. `exportProjectToBytes(project, { format: "ustx" })` exports the whole
song with absolute note placement. Score conversion cannot retain every native
field; imported tracks become one part each.

The single-score functions below select one track on import. Use them when your
app works with `Score` rather than `Project`.

## Score import

Import scores from any supported file format. The import pipeline:

```text
File or bytes  -->  utaformatix-3 parser  -->  UfData  -->  Score
```

### Supported Formats

| Extension            | Format                  | Import | Export |
|----------------------|-------------------------|--------|--------|
| `.ust`               | UTAU Sequence Text      | Yes    | Yes    |
| `.ustx`              | OpenUtau USTX           | Yes    | Yes    |
| `.vsqx`              | Vocaloid SQ             | Yes    | Yes    |
| `.vsq`               | Vocaloid SQ (legacy)    | Yes    | Yes    |
| `.vpr`               | Vocaloid 5 Project      | Yes    | Yes    |
| `.svp`               | SynthV Project          | Yes    | Yes    |
| `.s5p`               | SynthV S5P              | Yes    | Yes    |
| `.ccs`               | CeVIO Creative Studio   | Yes    | Yes    |
| `.dv`                | AHS VOICEROID           | Yes    | Yes    |
| `.mid` / `.midi`     | Standard MIDI           | Yes    | Yes    |
| `.musicxml` / `.xml` | MusicXML                | Yes    | Yes    |
| `.ppsf`              | Piapro Studio           | Yes    | No     |
| `.tssln`             | TSSLN                   | Yes    | Yes    |
| `.ufdata`            | UTAU Format Data (JSON) | Yes    | Yes    |

### Import from File

```typescript
import { importScoreFromFile } from "@audiflo/ichikara";

// Browser file input
const input = document.querySelector('input[type="file"]');
if (!(input instanceof HTMLInputElement)) throw new Error("Missing score file input");
input.addEventListener("change", () => {
  const file = input.files?.[0];
  if (!file) return;
  importScoreFromFile(file)
    .then((score) => console.info(`Imported ${score.notes.length} notes`))
    .catch((error: unknown) => console.error("Could not import score", error));
});
```

### Import from Bytes

```typescript
import { importScoreFromBytes } from "@audiflo/ichikara";

const response = await fetch("song.ustx");
if (!response.ok) throw new Error(`Score download failed: ${response.status}`);
const buf = new Uint8Array(await response.arrayBuffer());
const score = await importScoreFromBytes(buf, "song.ustx");
```

### Import Options

```typescript
const score = await importScoreFromFile(file, {
  trackIndex: 0,   // Import first track
  pitch: true,     // Include pitch-bend data
});
```

## Export

Export a Score to any supported format:

### Export as Bytes

```typescript
import { exportScoreToBytes } from "@audiflo/ichikara";

const bytes = await exportScoreToBytes(score, {
  format: "ustx",
  projectName: "My Song",
});
```

### Export as Blob

```typescript
const blob = await exportScoreToBlob(score, { format: "mid" });
```

### Download in Browser

```typescript
import { downloadScore } from "@audiflo/ichikara";

await downloadScore(score, {
  format: "ustx",
  projectName: "exported-song",
});
```

### Low-Level: Direct UfData Conversion

```typescript
import { scoreToUfData, ufDataToScore } from "@audiflo/ichikara";

const ufData = scoreToUfData(score);
const scoreBack = ufDataToScore(ufData);
```
