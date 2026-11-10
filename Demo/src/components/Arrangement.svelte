<script lang="ts">
  import { MeterMap, type Project, type VocalPart, type VocalTrack } from "ichikara";
  import { Plus, Copy, Trash2, AudioLines } from "@lucide/svelte";
  import ResizeHandle from "./ui/ResizeHandle.svelte";
  import { layoutBounds } from "../lib/editor/preferences";
  import { followPosition } from "../lib/editor/viewport";

  let {
    // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
    project = $bindable(),
    trackId,
    partId,
    playheadTick,
    autoScroll,
    followMode,
    trackHeight = $bindable(78),
    trackWidth = $bindable(196),
    onSelect,
    onChange,
    onAddTrack,
    onAddPart,
    onDuplicate,
    onDelete,
  }: {
    project: Project;
    trackId: string | null;
    partId: string | null;
    playheadTick: number | null;
    autoScroll: boolean;
    followMode: "page" | "smooth";
    trackHeight?: number;
    trackWidth?: number;
    onSelect: (trackId: string, partId: string | null) => void;
    onChange: () => void;
    onAddTrack: () => void;
    onAddPart: (track: VocalTrack) => void;
    onDuplicate: () => void;
    onDelete: () => void;
  } = $props();

  const PIXELS_PER_BEAT = 44;
  let scrollContainer: HTMLDivElement | undefined = $state();
  let viewportWidth = $state(0);
  let scrollLeft = $state(0);
  const endTick = $derived(
    project.tracks.reduce((end, track) => track.parts.reduce((end, part) => Math.max(end, part.tick + part.length), end), 0),
  );
  const beats = $derived(Math.max(32, Math.ceil(endTick / project.resolution) + 8));
  const width = $derived(beats * PIXELS_PER_BEAT);
  const meter = $derived(new MeterMap(project.meters, project.resolution));
  const lines = $derived(
    meter.grid(
      Math.max(0, (scrollLeft / PIXELS_PER_BEAT) * project.resolution),
      Math.max(0, ((scrollLeft + viewportWidth) / PIXELS_PER_BEAT) * project.resolution),
    ),
  );
  const x = (tick: number): number => (tick / project.resolution) * PIXELS_PER_BEAT;
  let drag: { part: VocalPart; track: VocalTrack; pointer: number; x: number; tick: number; length: number; resize: boolean } | null = null;

  $effect(() => {
    if (autoScroll && playheadTick !== null && scrollContainer) {
      scrollContainer.scrollLeft = followPosition(x(playheadTick), scrollLeft, viewportWidth - trackWidth, width, followMode);
    }
  });

  function begin(event: PointerEvent, track: VocalTrack, part: VocalPart): void {
    if (event.button !== 0) return;
    onSelect(track.id, part.id);
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    target.setPointerCapture(event.pointerId);
    const resize = event.clientX >= target.getBoundingClientRect().right - 10;
    drag = { part, track, pointer: event.pointerId, x: event.clientX, tick: part.tick, length: part.length, resize };
  }

  function move(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointer) return;
    const delta = Math.round((event.clientX - drag.x) / PIXELS_PER_BEAT) * project.resolution;
    if (drag.resize) {
      const noteEnd = drag.part.notes.reduce((end, note) => Math.max(end, note.tick + note.length), project.resolution);
      drag.part.length = Math.max(noteEnd, drag.length + delta);
    } else drag.part.tick = Math.max(0, drag.tick + delta);
  }

  function finish(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.resize) {
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-track-id]");
      const destination = project.tracks.find((track) => track.id === row?.dataset["trackId"]);
      if (destination && destination.id !== drag.track.id) {
        const moving = drag.part;
        drag.track.parts = drag.track.parts.filter((part) => part.id !== moving.id);
        destination.parts.push(moving);
        onSelect(destination.id, moving.id);
      }
    }
    drag = null;
    onChange();
  }

  function cancel(): void {
    if (!drag) return;
    drag.part.tick = drag.tick;
    drag.part.length = drag.length;
    drag = null;
  }
</script>

<svelte:window onpointermove={move} onpointerup={finish} onpointercancel={cancel} />
<section class="arrangement" aria-label="Song arrangement" style:--track-height="{trackHeight}px" style:--track-width="{trackWidth}px">
  <div class="section-toolbar">
    <h2>Tracks</h2>
    <span class="section-meta">{project.tracks.length} vocal {project.tracks.length === 1 ? "track" : "tracks"}</span>
    <div class="spacer"></div>
    <button onclick={onAddTrack}><Plus size={14} /> Add track</button>
    <button class="icon-btn" onclick={onDuplicate} disabled={!partId} title="Duplicate selected part"><Copy size={14} /></button>
    <button class="icon-btn" onclick={onDelete} disabled={!partId} title="Delete selected part"><Trash2 size={14} /></button>
  </div>
  <div
    class="arrangement-scroll"
    bind:this={scrollContainer}
    bind:clientWidth={viewportWidth}
    onscroll={(event) => {
      scrollLeft = event.currentTarget.scrollLeft;
    }}
  >
    <div class="arrangement-content" style:min-width="{trackWidth + width}px">
      <div class="ruler">
        <div class="ruler-heading">
          OneVoice
          <div class="header-resize">
            <ResizeHandle
              label="Track header width"
              controls="arrangement-pane"
              axis="x"
              value={trackWidth}
              {...layoutBounds.trackHeaderWidth}
              onChange={(value: number) => {
                trackWidth = value;
              }}
            />
          </div>
        </div>
        <div class="ruler-beats" style:width="{width}px">
          {#each lines as line (line.tick)}
            <span class:bar-label={line.beat === 1} style:left="{x(line.tick)}px"
              >{line.beat === 1 ? line.bar : `${line.bar}.${line.beat}`}</span
            >
          {/each}
        </div>
      </div>
      {#each project.tracks as track, index (track.id)}
        <div id="track-{track.id}" class="track-row" class:selected={trackId === track.id} data-track-id={track.id}>
          <div class="track-header">
            <button
              class="track-select"
              class:active={trackId === track.id}
              aria-label="Select {track.name}"
              onclick={() => onSelect(track.id, track.parts[0]?.id ?? null)}
            >
              <span class="track-number">{String(index + 1).padStart(2, "0")}</span><AudioLines size={18} />
            </button>
            <div class="track-info">
              <input aria-label="Track {index + 1} name" bind:value={track.name} onchange={onChange} />
              <div class="track-switches">
                <button
                  class:enabled={track.mute}
                  aria-pressed={track.mute}
                  aria-label="Mute {track.name}"
                  onclick={() => {
                    track.mute = !track.mute;
                    onChange();
                  }}>M</button
                >
                <button
                  class:solo={track.solo}
                  aria-pressed={track.solo}
                  aria-label="Solo {track.name}"
                  onclick={() => {
                    track.solo = !track.solo;
                    onChange();
                  }}>S</button
                >
                <span>{track.language.toUpperCase()}</span>
                <button title="Add part to {track.name}" onclick={() => onAddPart(track)}><Plus size={12} /></button>
              </div>
            </div>
          </div>
          <div class="track-lane" style:width="{width}px" style:--beat-width="{PIXELS_PER_BEAT}px">
            {#if playheadTick !== null}<div class="arrangement-playhead" style:left="{x(playheadTick)}px" aria-hidden="true"></div>{/if}
            {#each track.parts as part (part.id)}
              <button
                class="vocal-part"
                class:active={partId === part.id}
                class:muted={track.mute}
                style:left="{x(part.tick)}px"
                style:width="{Math.max(18, x(part.length))}px"
                aria-label="{part.name}, {part.notes.length} notes"
                aria-pressed={partId === part.id}
                onpointerdown={(event) => begin(event, track, part)}
                onclick={() => onSelect(track.id, part.id)}
              >
                <span class="part-name">{part.name}</span>
                <svg viewBox="0 0 {part.length} 48" preserveAspectRatio="none" aria-hidden="true">
                  {#each part.notes as note (note.id)}
                    <rect x={note.tick} y={42 - (note.noteNum - 48) * 0.8} width={note.length} height="3" rx="1" />
                  {/each}
                </svg>
                <span class="resize-grip" aria-hidden="true"></span>
              </button>
            {/each}
          </div>
        </div>
        <ResizeHandle
          label="Track {index + 1} height"
          controls="track-{track.id}"
          axis="y"
          value={trackHeight}
          {...layoutBounds.trackHeight}
          onChange={(value: number) => {
            trackHeight = value;
          }}
        />
      {/each}
      {#if project.tracks.length === 0}
        <div class="empty-arrangement">
          <h3>Start with a voice.</h3>
          <p>Add a vocal track, then draw the first phrase.</p>
          <button onclick={onAddTrack}><Plus size={15} /> Add vocal track</button>
        </div>
      {/if}
    </div>
  </div>
  <div class="arrangement-hint">Drag parts to arrange. Drag their right edge to resize. Move between tracks to change the singer.</div>
</section>

<style>
  .arrangement {
    display: flex;
    flex-direction: column;
    min-height: 170px;
    height: 100%;
  }
  .arrangement-scroll {
    overflow: auto;
    flex: 1;
    background: var(--canvas-bg);
  }
  .arrangement-content {
    min-height: 100%;
  }
  .arrangement-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
    z-index: 1;
    pointer-events: none;
  }
  .ruler-beats .bar-label {
    color: var(--text);
    font-weight: 600;
  }
  .ruler {
    display: flex;
    height: 28px;
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border-strong);
  }
  .ruler-heading {
    position: sticky;
    left: 0;
    z-index: 4;
    width: var(--track-width);
    flex-shrink: 0;
    padding: 6px 14px;
    font-size: 10px;
    color: var(--text-dim);
    background: var(--bg-2);
  }
  .ruler-beats {
    position: relative;
  }
  .header-resize {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
  }
  .ruler-beats span {
    position: absolute;
    top: 6px;
    padding-left: 6px;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  .track-row {
    display: flex;
    height: var(--track-height);
    border-bottom: 1px solid var(--border);
  }
  .track-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: var(--track-width);
    flex-shrink: 0;
    position: sticky;
    left: 0;
    z-index: 2;
    background: var(--bg-1);
    padding: 8px;
    border-right: 1px solid var(--border-strong);
  }
  .selected .track-header {
    background: var(--bg-3);
  }
  .track-select {
    display: flex;
    flex-direction: column;
    gap: 7px;
    border: none;
    background: transparent;
    color: var(--text-dim);
    padding: 0 5px;
    height: auto;
  }
  .track-select.active {
    color: var(--accent);
  }
  .track-number {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .track-info {
    min-width: 0;
    flex: 1;
  }
  .track-info input {
    width: 100%;
    border: none;
    background: transparent;
    font-weight: 600;
    font-size: 12px;
    color: var(--text);
    padding: 3px;
  }
  .track-switches {
    display: flex;
    gap: 4px;
    align-items: center;
    margin-top: 5px;
  }
  .track-switches button {
    width: var(--control-sm);
    height: var(--control-sm);
    padding: 0;
    font-size: 10px;
    justify-content: center;
    border-radius: 4px;
  }
  .track-switches span {
    margin-left: auto;
    margin-right: 4px;
    font-size: 9px;
    color: var(--text-dim);
  }
  .track-switches .enabled {
    background: var(--text-dim);
    color: var(--bg-0);
  }
  .track-switches .solo {
    background: var(--warn);
    color: #282416;
  }
  .track-lane {
    position: relative;
    background: repeating-linear-gradient(to right, var(--grid-beat) 0 1px, transparent 1px var(--beat-width));
  }
  .selected .track-lane {
    background-color: color-mix(in srgb, var(--accent) 4%, transparent);
  }
  .vocal-part {
    position: absolute;
    top: 5px;
    height: calc(var(--track-height) - 12px);
    overflow: hidden;
    padding: 0;
    display: block;
    text-align: left;
    background: var(--region);
    border: 1px solid var(--region-line);
    border-radius: 5px;
    color: var(--region-ink);
    touch-action: none;
    cursor: grab;
  }
  .vocal-part.active {
    outline: 2px solid #c0e4c9;
    outline-offset: -2px;
    background: var(--region-active);
  }
  .vocal-part.muted {
    opacity: 0.45;
  }
  .part-name {
    display: block;
    height: 22px;
    padding: 3px 8px;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: #0002;
  }
  .vocal-part svg {
    display: block;
    width: 100%;
    height: 39px;
    fill: #c0e4c9;
  }
  .resize-grip {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 9px;
    cursor: ew-resize;
    border-right: 3px solid #ffffff25;
  }
  .arrangement-hint {
    font-size: 10px;
    color: var(--text-dim);
    padding: 6px 14px;
    background: var(--bg-1);
    border-top: 1px solid var(--border);
  }
  .empty-arrangement {
    padding: 32px;
  }
  .empty-arrangement h3 {
    margin: 0;
    font-size: 17px;
  }
  .empty-arrangement p {
    color: var(--text-dim);
    font-size: 13px;
  }
</style>
