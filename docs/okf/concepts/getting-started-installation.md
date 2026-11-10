---
type: concept
title: Installation
description: "Install Ichikara via npm or use it directly in the browser"
source: "https://audiflo.github.io/Ichikara/docs/getting-started/installation/"
path: /getting-started/installation/
updated: 2026-11-10
okf:
  generated_by: "@docmd/plugin-okf"
  generated_at: "2026-11-10T13:24:54.241Z"
---
---
title: "Installation"
description: "Install Ichikara via npm or use it directly in the browser"
---

## npm

The [browser editor](https://audiflo.github.io/Ichikara) needs no installation. To use
the synthesis library in another project:

```bash
npm install @audiflo/ichikara
```

## Browser (CDN)

```html
<script type="module">
  import { renderScore, chitoseChika } from "https://unpkg.com/@audiflo/ichikara/dist/index.mjs";
</script>
```

## Build from Source

```bash
git clone https://github.com/Audiflo/Ichikara.git --recurse-submodules
cd Ichikara
npm ci
npm run build -w Build
npm run dev -w Demo
```

The `--recurse-submodules` flag is required for CMUDict (English G2P data).

## Requirements

- **Node.js 22.18+ or 24** for development and server-side examples
- **Any modern browser** (Chrome, Firefox, Safari, Edge) for browser usage
- No native dependencies - pure JavaScript/TypeScript

Run `npm run check` from the repository root for type checks, lint, tests, and a
production build. See [Development checks](../development.md) for compiler setup.
