---
title: "Installation"
description: "Install Ichikara via npm or use it directly in the browser"
---

## npm

The [browser editor](https://nellowtcs.me/Ichikara) needs no installation. To use
the synthesis library in another project:

```bash
npm install ichikara
```

## Browser (CDN)

```html
<script type="module">
import { renderScore, chitoseChika } from "https://unpkg.com/ichikara/dist/index.mjs";
</script>
```

## Build from Source

```bash
git clone https://github.com/NellowTCS/Ichikara.git --recurse-submodules
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
