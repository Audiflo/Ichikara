<script lang="ts">
  import { onMount } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import type { ProjectNote } from "@audiflo/ichikara";
  import { expressions, expressionValueAt, type Expression } from "../lib/editor/expression";
  import { createNoteIndex, visibleNotes } from "../lib/editor/note-index";

  const {
    notes,
    selectedNote,
    pixelsPerBeat,
    ticksPerBeat,
    scrollX,
    keyWidth,
    height,
    onSelect,
    onEdit,
    onCommit,
    onWheel,
  }: {
    notes: ProjectNote[];
    selectedNote: number | null;
    pixelsPerBeat: number;
    ticksPerBeat: number;
    scrollX: number;
    keyWidth: number;
    height: number;
    onSelect: (index: number, reveal: boolean) => void;
    onEdit: (id: string, expression: Expression, value: number) => void;
    onCommit: () => void;
    onWheel: (event: WheelEvent) => void;
  } = $props();

  let expression = $state<Expression>("intensity");
  const config = $derived(expressions.find((item) => item.key === expression));
  const index = $derived(createNoteIndex(notes));
  let width = $state(0);
  let laneHeight = $state(0);
  const visible = $derived(
    visibleNotes(index, (scrollX / pixelsPerBeat) * ticksPerBeat, ((scrollX + width) / pixelsPerBeat) * ticksPerBeat),
  );
  const selected = $derived(selectedNote === null ? undefined : notes[selectedNote]);
  let preview = $state<number | null>(null);
  const value = $derived(preview ?? selected?.[expression] ?? config?.fallback ?? 100);
  let canvas = $state<HTMLCanvasElement>();
  let frame = 0;
  let colors = { bar: "", selected: "", line: "" };
  const drafts = new SvelteMap<string, number>();
  let drag: { pointer: number; left: number; top: number; height: number; expression: Expression } | null = null;

  function readColors(): void {
    const style = getComputedStyle(document.documentElement);
    colors = {
      bar: style.getPropertyValue("--text-dim").trim(),
      selected: style.getPropertyValue("--accent").trim(),
      line: style.getPropertyValue("--border-strong").trim(),
    };
    paint();
  }

  function draw(): void {
    if (!canvas || !config || width <= 0 || laneHeight <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = devicePixelRatio || 1;
    const physicalWidth = Math.ceil(width * scale);
    const physicalHeight = Math.ceil(laneHeight * scale);
    if (canvas.width !== physicalWidth) canvas.width = physicalWidth;
    if (canvas.height !== physicalHeight) canvas.height = physicalHeight;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, laneHeight);
    ctx.fillStyle = colors.line;
    ctx.fillRect(0, laneHeight / 2, width, 1);
    ctx.fillRect(0, laneHeight - 1, width, 1);
    for (const entry of visible) {
      const x = (entry.note.tick / ticksPerBeat) * pixelsPerBeat - scrollX;
      const barWidth = Math.max(2, (entry.note.length / ticksPerBeat) * pixelsPerBeat - 2);
      const level = drafts.get(entry.note.id) ?? entry.note[expression] ?? config.fallback;
      const barHeight = (level / config.maximum) * laneHeight;
      const y = Math.min(laneHeight - 2, laneHeight - barHeight);
      ctx.fillStyle = entry.index === selectedNote ? colors.selected : colors.bar;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(x + 1, y, barWidth, laneHeight - y);
      ctx.globalAlpha = 1;
      ctx.fillRect(x + 1, y, barWidth, 2);
      ctx.fillRect(x + 1, y, 2, laneHeight - y);
    }
  }

  function paint(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  function updateDrag(event: PointerEvent): void {
    if (!drag || drag.pointer !== event.pointerId || !config) return;
    const tick = ((event.clientX - drag.left + scrollX) / pixelsPerBeat) * ticksPerBeat;
    let hit;
    for (let i = visible.length - 1; i >= 0; i--) {
      const entry = visible[i];
      if (entry && tick >= entry.note.tick && tick <= entry.end) {
        hit = entry;
        break;
      }
    }
    if (!hit) return;
    const next = expressionValueAt(event.clientY - drag.top, drag.height, config.maximum);
    drafts.set(hit.note.id, next);
    preview = next;
    onSelect(hit.index, false);
    paint();
  }

  function begin(event: PointerEvent): void {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLCanvasElement)) return;
    event.preventDefault();
    event.currentTarget.focus();
    const rect = event.currentTarget.getBoundingClientRect();
    drag = { pointer: event.pointerId, left: rect.left, top: rect.top, height: rect.height, expression };
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDrag(event);
  }

  function finish(event: PointerEvent): void {
    if (!drag || drag.pointer !== event.pointerId) return;
    updateDrag(event);
    const key = drag.expression;
    drag = null;
    let changed = false;
    for (const [id, next] of drafts) {
      const note = notes.find((note) => note.id === id);
      if (note && next !== (note[key] ?? config?.fallback)) {
        onEdit(id, key, next);
        changed = true;
      }
    }
    drafts.clear();
    preview = null;
    if (changed) onCommit();
    paint();
  }

  function cancel(): void {
    drag = null;
    drafts.clear();
    preview = null;
    paint();
  }

  function editValue(next: number): void {
    if (!selected || !config || !Number.isFinite(next)) return;
    const clamped = Math.round(Math.max(0, Math.min(config.maximum, next)));
    if (clamped === value) return;
    onEdit(selected.id, expression, clamped);
    onCommit();
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      cancel();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const current = index.entries.findIndex((entry) => entry.index === selectedNote);
      const next = index.entries[Math.max(0, Math.min(index.entries.length - 1, current + (event.key === "ArrowLeft" ? -1 : 1)))];
      if (next) onSelect(next.index, true);
    } else if (config && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      editValue(event.key === "Home" ? 0 : event.key === "End" ? config.maximum : value + (event.key === "ArrowUp" ? step : -step));
    }
  }

  const scene = $derived([canvas, visible, selectedNote, expression, width, laneHeight, scrollX, pixelsPerBeat, ticksPerBeat]);
  let lastScene: readonly unknown[] | null = null;
  function invalidate(next: readonly unknown[]): void {
    if (lastScene === next) return;
    lastScene = next;
    paint();
  }
  $effect(() => {
    invalidate(scene);
  });
  onMount(() => {
    readColors();
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });
</script>

{#if config}
  <section id="expression-lane" class="expression-lane" aria-label="Note expression" style:height="{height}px" onwheel={onWheel}>
    <div class="expression-heading">
      <select aria-label="Expression" bind:value={expression} onchange={cancel}>
        {#each expressions as item (item.key)}<option value={item.key}>{item.name}</option>{/each}
      </select>
      <input
        class="expression-number"
        type="number"
        aria-label="{config.name} value"
        min="0"
        max={config.maximum}
        step="1"
        {value}
        disabled={!selected}
        onchange={(event) => {
          editValue(event.currentTarget.valueAsNumber);
          event.currentTarget.value = String(value);
        }}
      />
      <span>{config.unit}</span>
      <span class="expression-hint">Drag bars to edit</span>
    </div>
    <div class="expression-values" style:margin-left="{keyWidth}px" bind:clientWidth={width} bind:clientHeight={laneHeight}>
      <canvas
        bind:this={canvas}
        tabindex="0"
        aria-label="{config.name} editor. Drag bars to edit; left and right select notes, up and down adjust values."
        onpointerdown={begin}
        onpointermove={updateDrag}
        onpointerup={finish}
        onpointercancel={cancel}
        onlostpointercapture={cancel}
        onkeydown={keydown}
      ></canvas>
    </div>
  </section>
{/if}

<style>
  .expression-lane {
    min-height: 0;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    background: var(--bg-inset);
    border-top: 1px solid var(--border-strong);
  }
  .expression-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    height: calc(var(--control-h) + 8px);
    flex-shrink: 0;
    padding: 0 10px;
  }
  .expression-heading select {
    font-size: var(--control-font);
  }
  .expression-heading span {
    color: var(--text-dim);
    font-size: 11px;
  }
  .expression-number {
    width: 62px;
    font-variant-numeric: tabular-nums;
  }
  .expression-number:disabled {
    opacity: 0.4;
  }
  .expression-hint {
    margin-left: auto;
  }
  .expression-values {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    contain: strict;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
  }
  canvas:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
</style>
