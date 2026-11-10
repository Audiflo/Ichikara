<script lang="ts" generics="T extends string">
  import { ToggleGroup } from "bits-ui";
  let {
    // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
    value = $bindable(),
    options,
    size = "md",
  }: {
    value: T;
    options: { value: T; label: string }[];
    size?: "sm" | "md";
  } = $props();
</script>

<ToggleGroup.Root
  type="single"
  {value}
  onValueChange={(next) => {
    const selected = options.find((option) => option.value === next);
    if (selected) value = selected.value;
  }}
  class="segmented {size}"
>
  {#each options as o (o.value)}
    <ToggleGroup.Item value={o.value} class="seg-item">{o.label}</ToggleGroup.Item>
  {/each}
</ToggleGroup.Root>
