import { writable } from "svelte/store";

/** Named accent available in editor settings. */
export type AccentPreset = {
  id: string;
  name: string;
  color: string;
};

const DEFAULT_ACCENT: AccentPreset = { id: "blue", name: "Blue", color: "#89b4f8" };

/** Supported accent palette. */
export const ACCENTS: readonly AccentPreset[] = [
  DEFAULT_ACCENT,
  { id: "teal", name: "Teal", color: "#79bcb3" },
  { id: "ember", name: "Ember", color: "#ff6a3d" },
  { id: "amber", name: "Amber", color: "#f5a623" },
  { id: "lime", name: "Lime", color: "#b6f23c" },
  { id: "coral", name: "Coral", color: "#ff4d6d" },
  { id: "violet", name: "Violet", color: "#8b5cf6" },
  { id: "sky", name: "Sky", color: "#38bdf8" },
  { id: "bone", name: "Bone", color: "#e5e7eb" },
];

const STORAGE_KEY = "ichikara.accent";

function loadAccentId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ACCENTS.some((a) => a.id === stored)) return stored;
  } catch (error) {
    console.warn("Cannot read accent preference; using the default", error);
  }
  return DEFAULT_ACCENT.id;
}

/** Current accent preference, persisted when browser storage is available. */
export const accentId = writable<string>(loadAccentId());

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function inkFor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#10100f" : "#f6f7fb";
}

/** Apply a named accent to the document, falling back to the default for unknown IDs. */
export function applyAccent(id: string): void {
  const a = ACCENTS.find((x) => x.id === id) ?? DEFAULT_ACCENT;
  const root = document.documentElement;
  const [r, g, b] = hexToRgb(a.color);
  root.style.setProperty("--accent", a.color);
  root.style.setProperty("--accent-ink", inkFor(a.color));
  root.style.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.16)`);
  root.style.setProperty("--accent-line", `rgba(${r}, ${g}, ${b}, 0.42)`);
}

accentId.subscribe((id) => {
  applyAccent(id);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch (error) {
    console.warn("Cannot persist accent preference; it will last for this session", error);
  }
});
