<script lang="ts">
  const {
    label,
    controls,
    axis,
    value,
    min,
    max,
    onChange,
    scale = 1,
    step = 10,
    reverse = false,
    onCommit,
  }: {
    label: string;
    controls: string;
    axis: "x" | "y";
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    scale?: number;
    step?: number;
    reverse?: boolean;
    onCommit?: () => void;
  } = $props();

  let drag: { pointer: number; coordinate: number; value: number } | null = null;

  function change(next: number): void {
    onChange(Math.max(min, Math.min(max, next)));
  }

  function begin(event: PointerEvent): void {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, coordinate: axis === "x" ? event.clientX : event.clientY, value };
  }

  function move(event: PointerEvent): void {
    if (!drag || drag.pointer !== event.pointerId) return;
    const delta = ((axis === "x" ? event.clientX : event.clientY) - drag.coordinate) / Math.max(Number.EPSILON, scale);
    change(drag.value + delta * (reverse ? -1 : 1));
  }

  function finish(event: PointerEvent): void {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag = null;
    onCommit?.();
  }

  function cancel(): void {
    if (drag) change(drag.value);
    drag = null;
  }

  function keydown(event: KeyboardEvent): void {
    const decrease = axis === "x" ? "ArrowLeft" : "ArrowUp";
    const increase = axis === "x" ? "ArrowRight" : "ArrowDown";
    if (![decrease, increase, "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") change(min);
    else if (event.key === "End") change(max);
    else change(value + (event.key === increase ? step : -step) * (reverse ? -1 : 1));
    onCommit?.();
  }
</script>

<!--
  A focusable separator is an interactive window splitter with arrow-key resizing.
  Svelte classifies the role as noninteractive without checking focusability.
  See https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="resize-handle"
  class:vertical={axis === "x"}
  role="separator"
  tabindex="0"
  aria-label={label}
  aria-controls={controls}
  aria-orientation={axis === "x" ? "vertical" : "horizontal"}
  aria-valuenow={Math.round(value * 100) / 100}
  aria-valuemin={min}
  aria-valuemax={max}
  onpointerdown={begin}
  onpointermove={move}
  onpointerup={finish}
  onpointercancel={cancel}
  onlostpointercapture={cancel}
  onkeydown={keydown}
></div>

<style>
  .resize-handle {
    flex-shrink: 0;
    height: var(--divider-size);
    width: 100%;
    cursor: row-resize;
    background: var(--bg-inset);
    touch-action: none;
    position: relative;
    z-index: 5;
  }
  .resize-handle.vertical {
    width: var(--divider-size);
    height: 100%;
    cursor: col-resize;
  }
  .resize-handle:hover,
  .resize-handle:focus-visible {
    background: var(--accent);
    outline: none;
  }
</style>
