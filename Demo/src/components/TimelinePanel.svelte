<script lang="ts">
  import { Dialog } from "bits-ui";
  import { Plus, Trash2, X } from "@lucide/svelte";
  import { parseProject, serializeProject, type Project } from "ichikara";

  const { project, onApply, onClose }: { project: Project; onApply: (project: Project) => void; onClose: () => void } = $props();
  let draft = $state<Project | null>(null);
  let error = $state("");
  $effect(() => {
    draft = $state.snapshot(project);
    error = "";
  });

  function apply(event: SubmitEvent): void {
    event.preventDefault();
    if (!draft) return;
    try {
      draft.tempos.sort((a, b) => a.tick - b.tick);
      draft.meters.sort((a, b) => a.tick - b.tick);
      onApply(parseProject(serializeProject($state.snapshot(draft))));
      onClose();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }
</script>

<Dialog.Root
  open
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog-content">
      <div class="dialog-header">
        <Dialog.Title class="dialog-title">Tempo and meter</Dialog.Title>
        <Dialog.Close aria-label="Close tempo map"><X size={16} /></Dialog.Close>
      </div>
      <div class="dialog-body">
        <Dialog.Description
          >Positions are absolute ticks, with {project.resolution} ticks per quarter note. The first events start at zero.</Dialog.Description
        >
        {#if draft}
          <form onsubmit={apply}>
            <h3>Tempo</h3>
            {#each draft.tempos as tempo, index (index)}
              <div class="event-row">
                <label
                  >Tick<input
                    aria-label="Tempo {index + 1} tick"
                    type="number"
                    min="0"
                    step="1"
                    required
                    readonly={index === 0}
                    bind:value={tempo.tick}
                  /></label
                >
                <label
                  >BPM<input
                    aria-label="Tempo {index + 1} BPM"
                    type="number"
                    min="20"
                    max="400"
                    step="0.01"
                    required
                    bind:value={tempo.tempo}
                  /></label
                >
                <button
                  type="button"
                  aria-label="Delete tempo {index + 1}"
                  disabled={index === 0}
                  onclick={() => {
                    draft?.tempos.splice(index, 1);
                  }}><Trash2 size={14} /></button
                >
              </div>
            {/each}
            <button
              type="button"
              onclick={() => {
                if (draft)
                  draft.tempos.push({
                    tick: (draft.tempos.at(-1)?.tick ?? 0) + project.resolution * 4,
                    tempo: draft.tempos.at(-1)?.tempo ?? 120,
                  });
              }}><Plus size={14} /> Add tempo change</button
            >
            <h3>Time signature</h3>
            {#each draft.meters as meter, index (index)}
              <div class="event-row">
                <label
                  >Tick<input
                    aria-label="Meter {index + 1} tick"
                    type="number"
                    min="0"
                    step="1"
                    required
                    readonly={index === 0}
                    bind:value={meter.tick}
                  /></label
                >
                <label
                  >Beats<input
                    aria-label="Meter {index + 1} numerator"
                    type="number"
                    min="1"
                    max="64"
                    step="1"
                    required
                    bind:value={meter.numerator}
                  /></label
                >
                <label
                  >Unit<select aria-label="Meter {index + 1} denominator" bind:value={meter.denominator}
                    >{#each [1, 2, 4, 8, 16, 32, 64] as denominator (denominator)}<option value={denominator}>{denominator}</option
                      >{/each}</select
                  ></label
                >
                <button
                  type="button"
                  aria-label="Delete meter {index + 1}"
                  disabled={index === 0}
                  onclick={() => {
                    draft?.meters.splice(index, 1);
                  }}><Trash2 size={14} /></button
                >
              </div>
            {/each}
            <button
              type="button"
              onclick={() => {
                if (draft) {
                  const previous = draft.meters.at(-1);
                  draft.meters.push({
                    tick: (previous?.tick ?? 0) + (project.resolution * 4 * (previous?.numerator ?? 4)) / (previous?.denominator ?? 4),
                    numerator: 4,
                    denominator: 4,
                  });
                }
              }}><Plus size={14} /> Add meter change</button
            >
            {#if error}<p role="alert">{error}</p>{/if}
            <div class="document-actions">
              <Dialog.Close type="button">Cancel</Dialog.Close><button type="submit">Apply changes</button>
            </div>
          </form>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  h3 {
    margin: 20px 0 10px;
    font-size: 13px;
  }
  .event-row {
    display: flex;
    gap: 10px;
    align-items: end;
    margin-bottom: 10px;
  }
  label {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: var(--text-dim);
    font-size: 11px;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    padding: 6px;
    color: var(--text);
    background: var(--bg-inset);
    border: 1px solid var(--border-strong);
    border-radius: 4px;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 9px;
  }
  p[role="alert"] {
    color: var(--bad);
  }
</style>
