<script lang="ts">
  import { getLanguage, type ProjectNote } from "ichikara";

  const {
    note,
    language,
    onChange,
    onError,
  }: {
    note: ProjectNote;
    language: string;
    onChange: (note: ProjectNote) => void;
    onError: (message: string) => void;
  } = $props();

  function numeric(event: Event, key: "noteNum" | "tick" | "length" | "velocity" | "intensity", min: number, max: number): void {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const value = input.valueAsNumber;
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      input.value = String(note[key] ?? 100);
      onError(`${key} must be a whole number between ${min} and ${max}.`);
      return;
    }
    const next = $state.snapshot(note);
    next[key] = value;
    if (key === "length" && next.pitchBend) {
      const index = next.pitchBend.ticks.findIndex((tick) => tick > value);
      if (index >= 0) {
        next.pitchBend.ticks.splice(index);
        next.pitchBend.values.splice(index);
      }
    }
    onChange(next);
  }

  function phonemes(event: Event): void {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const symbols = input.value.trim().split(/\s+/).filter(Boolean);
    const module = getLanguage(language);
    if (symbols.some((symbol) => !module?.phonemes.has(symbol))) {
      onError(`Unknown ${language.toUpperCase()} phoneme. Use symbols from the selected language.`);
      input.value = note.phonemes?.join(" ") ?? "";
      return;
    }
    const next = $state.snapshot(note);
    if (symbols.length) next.phonemes = symbols;
    else delete next.phonemes;
    onChange(next);
  }
</script>

<section class="note-inspector" aria-label="Selected note">
  <h3>Note</h3>
  <label
    >Lyric<input
      aria-label="Note lyric"
      value={note.lyric}
      onchange={(event) => onChange({ ...$state.snapshot(note), lyric: event.currentTarget.value })}
    /></label
  >
  <label
    >Phonemes<input
      aria-label="Note phonemes"
      value={note.phonemes?.join(" ") ?? ""}
      placeholder={getLanguage(language)?.lyricToPhonemes(note.lyric).join(" ") ?? "Automatic"}
      onchange={phonemes}
    /></label
  >
  <p class="field-hint">Leave phonemes empty to follow the lyric.</p>
  <div class="note-fields">
    <label
      >Pitch<input
        aria-label="Note pitch"
        type="number"
        min="0"
        max="127"
        value={note.noteNum}
        onchange={(event) => numeric(event, "noteNum", 0, 127)}
      /></label
    >
    <label
      >Start<input
        aria-label="Note start"
        type="number"
        min="0"
        value={note.tick}
        onchange={(event) => numeric(event, "tick", 0, Number.MAX_SAFE_INTEGER)}
      /></label
    >
    <label
      >Length<input
        aria-label="Note length"
        type="number"
        min="1"
        value={note.length}
        onchange={(event) => numeric(event, "length", 1, Number.MAX_SAFE_INTEGER)}
      /></label
    >
    <label
      >Velocity<input
        aria-label="Note velocity"
        type="number"
        min="0"
        max="127"
        value={note.velocity ?? 100}
        onchange={(event) => numeric(event, "velocity", 0, 127)}
      /></label
    >
    <label
      >Intensity<input
        aria-label="Note intensity"
        type="number"
        min="0"
        max="200"
        value={note.intensity ?? 100}
        onchange={(event) => numeric(event, "intensity", 0, 200)}
      /></label
    >
  </div>
</section>

<style>
  .note-inspector {
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }
  h3 {
    margin: 0 0 12px;
    font-size: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 10px;
    font-size: 11px;
    color: var(--text-dim);
  }
  input {
    width: 100%;
    min-width: 0;
  }
  .note-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 10px;
  }
  .field-hint {
    color: var(--text-dim);
    font-size: 10px;
    margin: -3px 0 14px;
  }
</style>
