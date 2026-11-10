<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { MeterMap, type MeterEvent, type Note, type ProjectNote } from "ichikara";
  import { ZoomIn, ZoomOut, Piano, Magnet } from "@lucide/svelte";
  import IconButton from "./ui/IconButton.svelte";
  import Segmented from "./ui/Segmented.svelte";
  import ExpressionLane from "./ExpressionLane.svelte";
  import ResizeHandle from "./ui/ResizeHandle.svelte";
  import { layoutBounds, type EditorPreferences } from "../lib/editor/preferences";
  import { followPosition } from "../lib/editor/viewport";
  import { constrainPane, workspaceSize } from "../lib/editor/layout";
  import { createNoteIndex, visibleNotes } from "../lib/editor/note-index";
  import type { Expression } from "../lib/editor/expression";

  let {
    notes = $bindable([]),
    selectedNote = $bindable<number | null>(null),
    playheadTick = $bindable<number | null>(null),
    autoScroll = $bindable(true),
    ticksPerBeat = 480,
    noteRangeMin = 36,
    noteRangeMax = 96,
    saveSnapshot = () => {},
    meters = [],
    partTick = 0,
    following = false,
    followMode = "page",
    noteHeight = 20,
    showKeyboard = $bindable(true),
    showExpression = true,
    expressionHeight = $bindable(104),
    snap = $bindable<EditorPreferences["snap"]>("1/8"),
  }: {
    notes?: ProjectNote[];
    selectedNote?: number | null;
    playheadTick?: number | null;
    autoScroll?: boolean;
    ticksPerBeat?: number;
    noteRangeMin?: number;
    noteRangeMax?: number;
    saveSnapshot?: () => void;
    meters?: MeterEvent[];
    partTick?: number;
    following?: boolean;
    followMode?: "page" | "smooth";
    noteHeight?: number;
    showKeyboard?: boolean;
    showExpression?: boolean;
    expressionHeight?: number;
    snap?: EditorPreferences["snap"];
  } = $props();

  const NOTE_Y_OFFSET = 28;
  let pxPerBeat = $state(120);
  const KEY_WIDTH = $derived(showKeyboard ? 52 : 0);
  const meter = $derived(new MeterMap(meters, ticksPerBeat));
  let tool = $state("notes");

  const DENOMINATORS: Record<string, number> = { "1/1": 1, "1/2": 2, "1/4": 4, "1/8": 8, "1/16": 16 };
  const snapSize = $derived(snap === "off" ? 1 : Math.max(1, Math.round((ticksPerBeat * 4) / (DENOMINATORS[snap] ?? 8))));
  function snapTick(t: number): number {
    return Math.round(t / snapSize) * snapSize;
  }

  const maxTick = $derived(notes.reduce((m, n) => Math.max(m, n.tick + n.length), 0));
  const contentBeats = $derived(maxTick > 0 ? Math.ceil(maxTick / ticksPerBeat) + 4 : 16);
  const contentWidth = $derived(KEY_WIDTH + contentBeats * pxPerBeat);
  const totalHeight = $derived((noteRangeMax - noteRangeMin + 1) * noteHeight + NOTE_Y_OFFSET);

  let notesCanvas: HTMLCanvasElement | undefined;
  let overlayCanvas: HTMLCanvasElement | undefined;
  let bgCache: OffscreenCanvas | null = null;
  let bgCacheKey = "";
  let viewW = $state(0);
  let viewH = $state(0);
  let editorHeight = $state(0);
  let toolbarHeight = $state(0);
  const expressionSize = $derived(
    constrainPane(
      expressionHeight,
      editorHeight,
      layoutBounds.expressionHeight.min,
      layoutBounds.expressionHeight.max,
      toolbarHeight + workspaceSize.piano + workspaceSize.divider,
    ),
  );
  let scrollX = $state(0);
  let scrollY = $state(0);

  function noteX(n: Note) {
    return KEY_WIDTH + ((n.tick ?? 0) / ticksPerBeat) * pxPerBeat;
  }
  function noteW(n: Note) {
    return (n.length / ticksPerBeat) * pxPerBeat;
  }
  function noteY(n: Note) {
    return NOTE_Y_OFFSET + (noteRangeMax - n.noteNum) * noteHeight;
  }
  function xToTick(x: number) {
    return ((x - KEY_WIDTH) / pxPerBeat) * ticksPerBeat;
  }
  function yToNote(y: number) {
    return noteRangeMax - Math.floor((y - NOTE_Y_OFFSET) / noteHeight);
  }
  type ThemeColors = {
    accent: string;
    accentInk: string;
    bg0: string;
    rowBlack: string;
    rowWhite: string;
    gridMeasure: string;
    gridBeat: string;
    pitchBend: string;
    rulerBg: string;
    rulerText: string;
    rulerTextStrong: string;
    keyBlack: string;
    keyWhite: string;
    keyLabel: string;
    keySeparator: string;
  };
  let themeColors: ThemeColors | undefined;

  function theme(): ThemeColors {
    return (themeColors ??= readThemeColors());
  }

  function refreshTheme(): void {
    themeColors = readThemeColors();
    bgCacheKey = "";
    renderAll();
  }
  function readThemeColors(): ThemeColors {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    const accent = v("--accent", "#2dd4bf");
    return {
      accent,
      accentInk: v("--accent-ink", "#10100f"),
      bg0: v("--canvas-bg", "#0a0a0d"),
      rowBlack: v("--canvas-row-black", "#0d0d18"),
      rowWhite: v("--canvas-row-white", "#10101c"),
      gridMeasure: v("--grid-measure", "rgba(255,255,255,0.10)"),
      gridBeat: v("--grid-beat", "rgba(255,255,255,0.045)"),
      pitchBend: v("--pitch-bend", "#ffdd44"),
      rulerBg: v("--ruler-bg", "rgba(8,8,16,0.92)"),
      rulerText: v("--ruler-text", "#5a607a"),
      rulerTextStrong: v("--ruler-text-strong", "#9aa0b8"),
      keyBlack: v("--key-black", "#23232f"),
      keyWhite: v("--key-white", "#e9e9f2"),
      keyLabel: v("--key-label", "#5a607a"),
      keySeparator: v("--key-separator", "rgba(255,255,255,0.12)"),
    };
  }
  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function resize(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const w = viewW;
    const h = viewH;
    if (w < 1 || h < 1) return null;
    const scale = devicePixelRatio || 1;
    const bw = Math.ceil(w * scale);
    const bh = Math.ceil(h * scale);
    if (c.width !== bw || c.height !== bh) {
      c.width = bw;
      c.height = bh;
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    return ctx;
  }

  function renderBackground(tc: ThemeColors) {
    const c = notesCanvas;
    if (!c) return;
    const ctx = resize(c);
    if (!ctx) return;

    // Ruler and keyboard stay pinned on different axes, so this composite cannot be translated as a whole.
    const key = JSON.stringify([
      viewW,
      viewH,
      scrollX,
      scrollY,
      pxPerBeat,
      ticksPerBeat,
      noteHeight,
      noteRangeMin,
      noteRangeMax,
      showKeyboard,
      tc.bg0,
      tc.rowBlack,
      tc.rowWhite,
      tc.gridMeasure,
      tc.gridBeat,
      tc.rulerBg,
      tc.rulerText,
      tc.rulerTextStrong,
      tc.keyBlack,
      tc.keyWhite,
      tc.keyLabel,
      tc.keySeparator,
      meters,
      partTick,
    ]);
    if (bgCache && bgCacheKey === key) {
      ctx.drawImage(bgCache, 0, 0);
      return;
    }

    // Regenerate cache
    const oc = bgCache ?? new OffscreenCanvas(viewW, viewH);
    if (oc.width !== viewW) oc.width = viewW;
    if (oc.height !== viewH) oc.height = viewH;
    const octx = oc.getContext("2d");
    if (!octx) throw new Error("The piano roll requires a 2D canvas context");
    octx.fillStyle = tc.bg0;
    octx.fillRect(0, 0, viewW, viewH);

    // note rows
    for (let n = noteRangeMin; n <= noteRangeMax; n++) {
      const y = NOTE_Y_OFFSET + (noteRangeMax - n) * noteHeight - scrollY;
      if (y + noteHeight < 0 || y > viewH) continue;
      const isBlack = [1, 3, 6, 8, 10].includes(n % 12);
      octx.fillStyle = isBlack ? tc.rowBlack : tc.rowWhite;
      octx.fillRect(KEY_WIDTH, y, viewW - KEY_WIDTH, noteHeight);
    }

    const firstTick = partTick + Math.max(0, xToTick(scrollX));
    const lastTick = partTick + xToTick(scrollX + viewW + pxPerBeat);
    const lines = meter.grid(firstTick, Math.max(firstTick, lastTick));
    for (const line of lines) {
      const x = KEY_WIDTH + ((line.tick - partTick) / ticksPerBeat) * pxPerBeat - scrollX;
      const isMeasure = line.beat === 1;
      octx.strokeStyle = isMeasure ? tc.gridMeasure : tc.gridBeat;
      octx.lineWidth = 1;
      octx.beginPath();
      octx.moveTo(x, NOTE_Y_OFFSET);
      octx.lineTo(x, viewH);
      octx.stroke();
    }

    // top ruler
    octx.fillStyle = tc.rulerBg;
    octx.fillRect(0, 0, viewW, NOTE_Y_OFFSET);
    octx.fillStyle = tc.rulerText;
    octx.font = "10px ui-monospace, monospace";
    octx.textAlign = "center";
    for (const line of lines) {
      const x = KEY_WIDTH + ((line.tick - partTick) / ticksPerBeat) * pxPerBeat - scrollX;
      if (line.beat === 1) {
        octx.fillStyle = tc.rulerTextStrong;
        octx.fillText(`${line.bar}`, x + 10, 18);
      }
    }

    // keyboard
    if (showKeyboard) {
      octx.save();
      octx.beginPath();
      octx.rect(0, NOTE_Y_OFFSET, KEY_WIDTH, viewH - NOTE_Y_OFFSET);
      octx.clip();
      octx.fillStyle = tc.bg0;
      octx.fillRect(0, 0, KEY_WIDTH, viewH);
      for (let n = noteRangeMin; n <= noteRangeMax; n++) {
        const y = NOTE_Y_OFFSET + (noteRangeMax - n) * noteHeight - scrollY;
        if (y + noteHeight < 0 || y > viewH) continue;
        const isBlack = [1, 3, 6, 8, 10].includes(n % 12);
        if (isBlack) {
          octx.fillStyle = tc.keyBlack;
          octx.fillRect(0, y, KEY_WIDTH, noteHeight);
        } else {
          octx.fillStyle = tc.keyWhite;
          octx.fillRect(0, y, KEY_WIDTH - 6, noteHeight);
          octx.fillStyle = tc.keyLabel;
          octx.font = "9px ui-monospace, monospace";
          octx.textAlign = "left";
          if (n % 12 === 0) octx.fillText(`C${Math.floor(n / 12) - 1}`, 3, y + noteHeight / 2 + 3);
        }
      }
      octx.strokeStyle = tc.keySeparator;
      octx.beginPath();
      octx.moveTo(KEY_WIDTH, 0);
      octx.lineTo(KEY_WIDTH, viewH);
      octx.stroke();
      octx.restore();
    }

    bgCache = oc;
    bgCacheKey = key;
    ctx.drawImage(bgCache, 0, 0);
  }

  function renderNotes() {
    const c = notesCanvas;
    if (!c) return;
    const ctx = resize(c);
    if (!ctx) return;
    const tc = theme();

    // Draw cached background (grid, rows, keyboard, ruler)
    renderBackground(tc);
    ctx.save();
    ctx.beginPath();
    ctx.rect(KEY_WIDTH, NOTE_Y_OFFSET, viewW - KEY_WIDTH, viewH - NOTE_Y_OFFSET);
    ctx.clip();

    // notes
    for (const { index: i, note: n } of visible) {
      const nx = noteX(n);
      if (nx + noteW(n) < scrollX || nx > scrollX + viewW) continue;
      const y = noteY(n) - scrollY;
      if (y + noteHeight < 0 || y > viewH) continue;
      const x = nx - scrollX;
      const ww = Math.max(6, noteW(n));
      const selected = selectedNote === i;
      ctx.fillStyle = tc.accent;
      roundRect(ctx, x + 1, y + 1, ww - 2, noteHeight - 2, 2);
      ctx.fill();
      if (selected) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = tc.accentInk;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = tc.accentInk;
      ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      if (ww > 22) ctx.fillText(n.lyric, x + 5, y + noteHeight / 2 + 3);
    }

    // Curves remain visible while editing another note; handles belong to the selection.
    for (const { index, note: n } of visible) {
      if (!n.pitchBend) continue;
      const pb = n.pitchBend;
      const first = pbPointPos(n, 0);
      const last = pbPointPos(n, pb.ticks.length - 1);
      if (!first || !last) continue;
      ctx.beginPath();
      ctx.moveTo(noteX(n) - scrollX, first.y - scrollY);
      for (let pi = 0; pi < pb.ticks.length; pi++) {
        const point = pbPointPos(n, pi);
        if (!point) continue;
        const px = point.x - scrollX;
        const py = point.y - scrollY;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(noteX(n) + noteW(n) - scrollX, last.y - scrollY);
      ctx.strokeStyle = tc.pitchBend;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (index !== selectedNote) continue;
      for (let pi = 0; pi < pb.ticks.length; pi++) {
        const point = pbPointPos(n, pi);
        if (!point) continue;
        const px = point.x - scrollX;
        const py = point.y - scrollY;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = activePoint === pi ? "#fff" : tc.pitchBend;
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function renderOverlay() {
    const c = overlayCanvas;
    if (!c) return;
    const ctx = resize(c);
    if (!ctx) return;
    ctx.clearRect(0, 0, viewW, viewH);
    if (playheadTick == null) return;
    const x = KEY_WIDTH + (playheadTick / ticksPerBeat) * pxPerBeat - scrollX;
    if (x < KEY_WIDTH - 2 || x > viewW) return;
    const tc = theme();
    ctx.strokeStyle = tc.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, NOTE_Y_OFFSET);
    ctx.lineTo(x, viewH);
    ctx.stroke();
    ctx.fillStyle = tc.accent;
    ctx.beginPath();
    ctx.moveTo(x - 5, NOTE_Y_OFFSET);
    ctx.lineTo(x + 5, NOTE_Y_OFFSET);
    ctx.lineTo(x, NOTE_Y_OFFSET + 7);
    ctx.closePath();
    ctx.fill();
  }

  let paintFrame = 0;
  let notesDirty = false;
  let overlayDirty = false;

  function requestPaint(notesLayer: boolean): void {
    notesDirty ||= notesLayer;
    overlayDirty = true;
    if (paintFrame) return;
    paintFrame = requestAnimationFrame(() => {
      paintFrame = 0;
      const drawNotes = notesDirty;
      const drawOverlay = overlayDirty;
      notesDirty = false;
      overlayDirty = false;
      if (drawNotes) renderNotes();
      if (drawOverlay) renderOverlay();
    });
  }

  function renderAll(): void {
    requestPaint(true);
  }

  const PB_RADIUS = 5;
  function pbPointPos(n: Note, pi: number) {
    const tick = n.pitchBend?.ticks[pi];
    const value = n.pitchBend?.values[pi];
    if (tick === undefined || value === undefined) return undefined;
    const x = noteX(n) + (tick / n.length) * noteW(n);
    const y = noteY(n) + noteHeight / 2 - value * noteHeight;
    return { x, y };
  }
  function findPitchPoint(n: Note, mx: number, my: number): number {
    if (!n.pitchBend) return -1;
    for (let i = 0; i < n.pitchBend.ticks.length; i++) {
      const p = pbPointPos(n, i);
      if (!p) continue;
      const dx = mx - p.x;
      const dy = my - p.y;
      if (dx * dx + dy * dy <= PB_RADIUS * PB_RADIUS * 4) return i;
    }
    return -1;
  }
  function addPitchPoint(n: Note, mx: number, my: number) {
    const relTick = ((mx - noteX(n)) / noteW(n)) * n.length;
    const relVal = (noteY(n) + noteHeight / 2 - my) / noteHeight;
    const tick = Math.max(0, Math.min(n.length, Math.round(relTick)));
    const val = Math.max(-12, Math.min(12, Math.round(relVal * 10) / 10));
    if (!n.pitchBend) {
      n.pitchBend = { ticks: [tick], values: [val] };
      return;
    }
    const pb = n.pitchBend;
    let insIdx = pb.ticks.length;
    for (const [i, existingTick] of pb.ticks.entries()) {
      if (existingTick === tick) return;
      if (existingTick > tick) {
        insIdx = i;
        break;
      }
    }
    pb.ticks.splice(insIdx, 0, tick);
    pb.values.splice(insIdx, 0, val);
  }

  function clientToScore(mx: number, my: number) {
    if (!notesCanvas) return { x: 0, y: 0 };
    const rect = notesCanvas.getBoundingClientRect();
    return { x: mx - rect.left + scrollX, y: my - rect.top + scrollY };
  }

  let activePoint = $state(-1);
  let dragging:
    | {
        type: "move" | "resize";
        startX: number;
        startY: number;
        origTick: number;
        origLen: number;
        origNote: number;
      }
    | { type: "pitch-point"; index: number }
    | null = null;

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0 && e.button !== 2) return;
    notesCanvas?.focus();
    const { x: mx, y: my } = clientToScore(e.clientX, e.clientY);
    const viewX = mx - scrollX;
    const viewY = my - scrollY;
    if (viewY < NOTE_Y_OFFSET) return;
    // keyboard click
    if (showKeyboard && viewX < KEY_WIDTH) {
      const nn = yToNote(my);
      const selected = selectedNote == null ? undefined : notes[selectedNote];
      if (selected) {
        selected.noteNum = nn;
        saveSnapshot();
        renderAll();
      }
      return;
    }
    if (viewX < KEY_WIDTH) return;

    if (selectedNote != null && e.button === 2) {
      const n = notes[selectedNote];
      if (n) {
        const pi = findPitchPoint(n, mx, my);
        if (pi >= 0 && n.pitchBend) {
          n.pitchBend.ticks.splice(pi, 1);
          n.pitchBend.values.splice(pi, 1);
          if (n.pitchBend.ticks.length === 0) delete n.pitchBend;
          activePoint = -1;
          saveSnapshot();
          renderAll();
          return;
        }
      }
    }

    if (selectedNote != null && e.button === 0 && tool === "notes") {
      const n = notes[selectedNote];
      if (n) {
        const resizeZone = mx >= noteX(n) + noteW(n) - 10 && mx <= noteX(n) + noteW(n) && my >= noteY(n) && my <= noteY(n) + noteHeight;
        if (resizeZone) {
          dragging = {
            type: "resize",
            startX: mx,
            startY: my,
            origTick: n.tick,
            origLen: n.length,
            origNote: n.noteNum,
          };
          return;
        }
      }
    }

    if (selectedNote != null && (e.button === 2 || tool === "pitch")) {
      const n = notes[selectedNote];
      if (n) {
        const pi = findPitchPoint(n, mx, my);
        if (pi >= 0) {
          activePoint = pi;
          dragging = { type: "pitch-point", index: pi };
          return;
        }
      }
      if (n && mx >= noteX(n) && mx <= noteX(n) + noteW(n)) {
        addPitchPoint(n, mx, my);
        const pi2 = findPitchPoint(n, mx, my);
        if (pi2 >= 0) {
          activePoint = pi2;
          dragging = {
            type: "pitch-point",
            index: pi2,
          };
        }
        saveSnapshot();
        renderAll();
        return;
      }
    }

    const hitIdx = notes.findIndex(
      (n: Note) => mx >= noteX(n) && mx <= noteX(n) + noteW(n) && my >= noteY(n) && my <= noteY(n) + noteHeight,
    );
    if (hitIdx >= 0) {
      selectedNote = hitIdx;
      activePoint = -1;
      const n = notes[hitIdx];
      if (!n) return;
      if (e.button === 2 || tool === "pitch") {
        addPitchPoint(n, mx, my);
        saveSnapshot();
        renderAll();
        return;
      }
      const dragStart = mx - noteX(n);
      dragging = {
        type: dragStart >= noteW(n) - 10 ? "resize" : "move",
        startX: mx,
        startY: my,
        origTick: n.tick,
        origLen: n.length,
        origNote: n.noteNum,
      };
    } else {
      if (e.button !== 0 || tool === "pitch") return;
      selectedNote = null;
      activePoint = -1;
      const tick = Math.max(0, snapTick(xToTick(mx)));
      const noteNum = yToNote(my);
      if (noteNum >= noteRangeMin && noteNum <= noteRangeMax) {
        const nn: ProjectNote = {
          id: crypto.randomUUID(),
          lyric: "a",
          noteNum,
          length: Math.max(snapSize, Math.round(ticksPerBeat / 2)),
          tick,
          velocity: 100,
        };
        notes.push(nn);
        selectedNote = notes.length - 1;
        dragging = {
          type: "move",
          startX: mx,
          startY: my,
          origTick: tick,
          origLen: nn.length,
          origNote: noteNum,
        };
        renderAll();
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragging || !notesCanvas || selectedNote == null) return;
    const { x: mx, y: my } = clientToScore(e.clientX, e.clientY);
    const n = notes[selectedNote];
    if (!n) return;
    if (dragging.type === "pitch-point" && n.pitchBend) {
      const pi = dragging.index;
      const minimum = pi === 0 ? 0 : (n.pitchBend.ticks[pi - 1] ?? 0) + 1;
      const maximum = pi === n.pitchBend.ticks.length - 1 ? n.length : (n.pitchBend.ticks[pi + 1] ?? n.length) - 1;
      const tick = Math.max(minimum, Math.min(maximum, Math.round(((mx - noteX(n)) / noteW(n)) * n.length)));
      const val = Math.max(-12, Math.min(12, Math.round(((noteY(n) + noteHeight / 2 - my) / noteHeight) * 10) / 10));
      n.pitchBend.ticks[pi] = tick;
      n.pitchBend.values[pi] = val;
      renderAll();
    } else if (dragging.type === "move") {
      const dx = ((mx - dragging.startX) / pxPerBeat) * ticksPerBeat;
      n.tick = Math.max(0, snapTick(dragging.origTick + dx));
      n.noteNum = Math.max(noteRangeMin, Math.min(noteRangeMax, dragging.origNote - Math.round((my - dragging.startY) / noteHeight)));
      renderAll();
    } else if (dragging.type === "resize") {
      const dx = ((mx - dragging.startX) / pxPerBeat) * ticksPerBeat;
      n.length = Math.max(snapSize, snapTick(dragging.origLen + dx));
      if (n.pitchBend) {
        const retained = n.pitchBend.ticks.findIndex((tick) => tick > n.length);
        if (retained >= 0) {
          n.pitchBend.ticks.splice(retained);
          n.pitchBend.values.splice(retained);
        }
      }
      renderAll();
    }
  }

  function handleMouseUp() {
    if (dragging) saveSnapshot();
    dragging = null;
    activePoint = -1;
    renderAll();
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
  }

  function handleKeyDown(e: KeyboardEvent) {
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selectedNote != null) {
      e.preventDefault();
      notes.splice(selectedNote, 1);
      selectedNote = null;
      saveSnapshot();
      renderAll();
    }
  }

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      pxPerBeat = Math.max(40, Math.min(360, pxPerBeat * factor));
      renderAll();
      return;
    }
    if (e.shiftKey || Math.abs(e.deltaX) > 0) {
      scrollX = Math.max(0, Math.min(contentWidth - viewW, scrollX + e.deltaX + (e.shiftKey ? e.deltaY : 0)));
    } else {
      scrollY = Math.max(0, Math.min(totalHeight - viewH, scrollY + e.deltaY));
    }
    renderAll();
    e.preventDefault();
  }

  function zoom(factor: number) {
    pxPerBeat = Math.max(40, Math.min(360, Math.round(pxPerBeat * factor)));
    renderAll();
  }

  function scrollToNotes() {
    if (!notes.length || !notesCanvas) return;
    const midTick = (Math.min(...notes.map((n) => n.tick)) + Math.max(...notes.map((n) => n.tick + n.length / 2))) / 2;
    const midNote = (Math.min(...notes.map((n) => n.noteNum)) + Math.max(...notes.map((n) => n.noteNum))) / 2;
    scrollX = Math.max(0, Math.min(contentWidth - viewW, KEY_WIDTH + (midTick / ticksPerBeat) * pxPerBeat - viewW / 2));
    scrollY = Math.max(0, Math.min(totalHeight - viewH, NOTE_Y_OFFSET + (noteRangeMax - midNote) * noteHeight - viewH / 2));
    renderAll();
  }

  // Snapshot note data only when the document changes, never on a scroll frame.
  const noteData = $derived($state.snapshot(notes));
  const noteIndex = $derived(createNoteIndex(noteData));
  const visible = $derived(
    visibleNotes(noteIndex, (scrollX / pxPerBeat) * ticksPerBeat, ((scrollX + viewW - KEY_WIDTH) / pxPerBeat) * ticksPerBeat),
  );
  const scene = $derived([
    noteData,
    selectedNote,
    activePoint,
    scrollX,
    scrollY,
    pxPerBeat,
    ticksPerBeat,
    noteHeight,
    noteRangeMin,
    noteRangeMax,
    showKeyboard,
    meter,
    partTick,
    viewW,
    viewH,
  ]);
  let lastScene: readonly unknown[] | null = null;
  function invalidate(next: readonly unknown[]): void {
    if (lastScene === next) return;
    lastScene = next;
    renderAll();
  }
  $effect(() => {
    invalidate(scene);
  });
  let previousViewHeight = 0;
  $effect(() => {
    if (viewW <= 0 || viewH <= 0) return;
    const previous = previousViewHeight;
    previousViewHeight = viewH;
    untrack(() => {
      if (previous === 0) scrollToNotes();
      // Preserve the visible pitch center as the parent split and expression lane settle or resize.
      else scrollY = Math.max(0, Math.min(totalHeight - viewH, scrollY + (previous - viewH) / 2));
    });
  });
  onMount(() => {
    refreshTheme();
    const observer = new MutationObserver(refreshTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => {
      cancelAnimationFrame(paintFrame);
      observer.disconnect();
    };
  });

  $effect(() => {
    if (playheadTick != null && autoScroll && following) {
      const x = (playheadTick / ticksPerBeat) * pxPerBeat;
      scrollX = followPosition(x, scrollX, viewW - KEY_WIDTH, contentWidth - KEY_WIDTH, followMode);
    }
    requestPaint(false);
  });

  function onResize() {
    renderAll();
  }

  $effect(() => {
    if (!notesCanvas) return;
    const observer = new ResizeObserver(onResize);
    observer.observe(notesCanvas);
    return () => observer.disconnect();
  });
</script>

<svelte:window onkeydown={handleKeyDown} onresize={onResize} onmousemove={handleMouseMove} onmouseup={handleMouseUp} />
<div class="piano-editor" bind:clientHeight={editorHeight}>
  <div class="piano-toolbar" bind:clientHeight={toolbarHeight}>
    <Segmented
      bind:value={tool}
      size="sm"
      options={[
        { value: "notes", label: "Notes" },
        { value: "pitch", label: "Pitch" },
      ]}
    />
    <IconButton onclick={() => zoom(1 / 1.2)} title="Zoom out"><ZoomOut size={16} /></IconButton>
    <IconButton onclick={() => zoom(1.2)} title="Zoom in"><ZoomIn size={16} /></IconButton>
    <span class="zoom-readout">{Math.round(pxPerBeat)}px/b</span>
    <Segmented
      bind:value={snap}
      size="sm"
      options={[
        { value: "off", label: "Off" },
        { value: "1/1", label: "1/1" },
        { value: "1/2", label: "1/2" },
        { value: "1/4", label: "1/4" },
        { value: "1/8", label: "1/8" },
        { value: "1/16", label: "1/16" },
      ]}
    />
    <div class="spacer"></div>
    <IconButton active={showKeyboard} onclick={() => (showKeyboard = !showKeyboard)} title="Toggle keyboard">
      <Piano size={16} />
    </IconButton>
    <IconButton active={autoScroll} onclick={() => (autoScroll = !autoScroll)} title="Toggle auto-scroll">
      <Magnet size={16} />
    </IconButton>
  </div>
  <div class="piano-scroll" bind:clientWidth={viewW} bind:clientHeight={viewH}>
    <canvas
      bind:this={notesCanvas}
      class="piano-canvas"
      onmousedown={handleMouseDown}
      onwheel={handleWheel}
      oncontextmenu={handleContextMenu}
      tabindex="0"
      aria-label="Piano roll. Click to add notes, drag to move or resize. Right-click to edit pitch."
    >
    </canvas>
    <canvas bind:this={overlayCanvas} class="piano-canvas" style="pointer-events:none"></canvas>
  </div>
  {#if showExpression}
    <ResizeHandle
      label="Expression height"
      controls="expression-lane"
      axis="y"
      {...expressionSize}
      reverse
      onChange={(value: number) => {
        expressionHeight = value;
      }}
    />
    <ExpressionLane
      notes={noteData}
      {selectedNote}
      pixelsPerBeat={pxPerBeat}
      {ticksPerBeat}
      {scrollX}
      keyWidth={KEY_WIDTH}
      height={expressionSize.value}
      onSelect={(index: number, reveal: boolean) => {
        selectedNote = index;
        const note = noteData[index];
        if (reveal && note)
          scrollX = followPosition((note.tick / ticksPerBeat) * pxPerBeat, scrollX, viewW - KEY_WIDTH, contentWidth - KEY_WIDTH, "page");
      }}
      onCommit={saveSnapshot}
      onWheel={handleWheel}
      onEdit={(id: string, expression: Expression, value: number) => {
        const note = notes.find((note) => note.id === id);
        if (note) note[expression] = value;
      }}
    />
  {/if}
</div>

<style>
  .piano-editor {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .piano-toolbar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-shrink: 0;
    flex-wrap: nowrap;
    overflow-x: auto;
  }
  .piano-toolbar > :global(*) {
    flex-shrink: 0;
  }
  .piano-toolbar .spacer {
    flex: 1;
  }
  .zoom-readout {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-faint);
    min-width: 56px;
    text-align: right;
  }
  .piano-scroll {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
    border-top: 1px solid var(--border);
    background: var(--bg-inset);
  }
  .piano-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
