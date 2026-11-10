<script lang="ts">
  import { Slider } from "bits-ui";

  let {
    value = $bindable(0),
    min = 0,
    max = 1,
    step = 0.01,
    disabled = false,
    ariaLabel = "",
    onChange,
    onCommit,
  }: {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    ariaLabel?: string;
    onChange?: (v: number) => void;
    onCommit?: (() => void) | undefined;
  } = $props();
</script>

<div class="slider">
  <Slider.Root
    type="single"
    bind:value
    {min}
    {max}
    {step}
    {disabled}
    aria-label={ariaLabel}
    class="slider-root"
    onValueChange={(v: number) => onChange?.(v)}
    onValueCommit={() => onCommit?.()}
  >
    {#snippet children({ thumbItems })}
      <div class="slider-track">
        <Slider.Range class="slider-range" />
      </div>
      {#each thumbItems as thumb (thumb.index)}
        <Slider.Thumb class="slider-thumb" index={thumb.index} aria-label={ariaLabel} />
      {/each}
    {/snippet}
  </Slider.Root>
</div>
