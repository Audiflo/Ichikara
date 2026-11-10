<script lang="ts">
  import { Dialog } from "bits-ui";
  import { X } from "@lucide/svelte";
  import Switch from "./ui/Switch.svelte";
  import { ACCENTS, accentId } from "../lib/theme";
  import { defaultPreferences, type EditorPreferences } from "../lib/editor/preferences";

  let {
    open = $bindable(false),
    // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment -- $bindable declares shared ownership, not a fallback value (https://svelte.dev/docs/svelte/$bindable).
    preferences = $bindable(),
    message = "",
  }: {
    open?: boolean;
    preferences: EditorPreferences;
    message?: string;
  } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog-content settings-dialog">
      <div class="dialog-header">
        <Dialog.Title class="dialog-title">Settings</Dialog.Title>
        <Dialog.Close class="icon-btn" aria-label="Close settings"><X size={16} /></Dialog.Close>
      </div>
      <div class="dialog-body">
        <Dialog.Description class="settings-description">Preferences are saved on this device and apply to every song.</Dialog.Description>
        <h3>Workspace</h3>
        <div class="setting-row">
          <span>
            <span class="setting-label">Selection color</span>
            <span class="setting-sub">Color used for selection highlights and active states.</span>
          </span>
          <div class="accent-row">
            {#each ACCENTS as a (a.id)}
              <button
                class="accent-swatch"
                class:active={$accentId === a.id}
                style="background:{a.color};color:{a.color}"
                title={a.name}
                aria-label={a.name}
                aria-pressed={$accentId === a.id}
                onclick={() => accentId.set(a.id)}
              ></button>
            {/each}
          </div>
        </div>
        <label class="setting-row">
          <span>
            <span class="setting-label">Auto-scroll during playback</span>
            <span class="setting-sub">Follow the playhead as the song plays.</span>
          </span>
          <Switch bind:checked={preferences.autoScroll} ariaLabel="Auto-scroll during playback" />
        </label>
        <label class="setting-row"
          ><span
            ><span class="setting-label">Follow mode</span><span class="setting-sub"
              >Page turns at the edge; smooth keeps the playhead in view.</span
            ></span
          >
          <select aria-label="Playback follow mode" bind:value={preferences.followMode}
            ><option value="page">Page</option><option value="smooth">Smooth</option></select
          ></label
        >
        <label class="setting-row"
          ><span class="setting-label">Piano keyboard</span><Switch
            bind:checked={preferences.showKeyboard}
            ariaLabel="Show piano keyboard"
          /></label
        >
        <label class="setting-row"
          ><span class="setting-label">Expression lane</span><Switch
            bind:checked={preferences.showExpression}
            ariaLabel="Show expression lane"
          /></label
        >
        <h3>Editing</h3>
        <label class="setting-row"
          ><span class="setting-label">Default snap</span><select aria-label="Default snap" bind:value={preferences.snap}>
            <option value="off">Off</option>{#each ["1/1", "1/2", "1/4", "1/8", "1/16"] as value (value)}<option {value}>{value}</option
              >{/each}
          </select></label
        >
        <label class="setting-row"
          ><span class="setting-label">Note row height</span><select aria-label="Note row height" bind:value={preferences.noteHeight}>
            <option value={14}>Compact</option><option value={20}>Standard</option><option value={26}>Large</option><option value={32}
              >Extra large</option
            >
          </select></label
        >
        <h3>Audio</h3>
        <label class="setting-row"
          ><span
            ><span class="setting-label">Sample rate</span><span class="setting-sub">Used for the next playback and WAV export.</span></span
          ><select aria-label="Sample rate" bind:value={preferences.sampleRate}>
            <option value={44100}>44.1 kHz</option><option value={48000}>48 kHz</option>
          </select></label
        >
        <label class="setting-row"
          ><span
            ><span class="setting-label">Playback prebuffer</span><span class="setting-sub"
              >More audio prepared before playback starts.</span
            ></span
          ><select aria-label="Playback prebuffer" bind:value={preferences.preBufferSeconds}>
            <option value={0.25}>0.25 seconds</option><option value={0.5}>0.5 seconds</option><option value={1}>1 second</option><option
              value={2}>2 seconds</option
            >
          </select></label
        >
        {#if message}<p role="status">{message}</p>{/if}
        <p class="hint">
          Drag panel dividers to resize. Focus a divider and use arrow keys for precise adjustment. Scroll the piano roll with the wheel,
          hold <kbd>Shift</kbd> for horizontal scrolling, or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> to zoom.
        </p>
        <div class="document-actions">
          <button
            onclick={() => {
              preferences = { ...defaultPreferences };
              accentId.set("blue");
            }}>Reset preferences</button
          ><Dialog.Close>Done</Dialog.Close>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.settings-dialog) {
    width: 520px;
  }
  :global(.settings-description) {
    margin: 0;
    color: var(--text-dim);
    font-size: 12px;
  }
  h3 {
    margin: 24px 0 4px;
    font-size: 12px;
  }
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 48px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .setting-label {
    display: block;
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
  }
  .setting-sub {
    display: block;
    font-size: 11px;
    color: var(--text-faint);
    margin-top: 2px;
  }
  .hint {
    margin: 18px 0 0;
    font-size: 11px;
    color: var(--text-faint);
    line-height: 1.6;
  }
  .hint kbd {
    font-family: var(--font-mono);
    font-size: 10px;
    background: var(--bg-3);
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    padding: 1px 5px;
    color: var(--text);
  }
  .accent-row {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 160px;
  }
  .accent-swatch {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: 2px solid var(--border-strong);
    cursor: pointer;
  }
  .accent-swatch:hover {
    border-color: var(--text);
  }
  .accent-swatch.active {
    border-color: var(--text);
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
</style>
