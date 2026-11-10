/** Device-local editor preferences, independent of song data and undo history. */
export interface EditorPreferences {
  autoScroll: boolean;
  followMode: "page" | "smooth";
  showKeyboard: boolean;
  showExpression: boolean;
  snap: "off" | "1/1" | "1/2" | "1/4" | "1/8" | "1/16";
  noteHeight: number;
  inspectorWidth: number;
  arrangementRatio: number;
  expressionHeight: number;
  trackHeight: number;
  trackHeaderWidth: number;
  sampleRate: 44100 | 48000;
  preBufferSeconds: number;
}

/** Shared defaults for first launch and the settings reset action. */
export const defaultPreferences: Readonly<EditorPreferences> = {
  autoScroll: true,
  followMode: "page",
  showKeyboard: true,
  showExpression: true,
  snap: "1/8",
  noteHeight: 20,
  inspectorWidth: 258,
  arrangementRatio: 0.5,
  expressionHeight: 104,
  trackHeight: 78,
  trackHeaderWidth: 196,
  sampleRate: 44100,
  preBufferSeconds: 0.5,
};

/** Bounds shared by settings validation and the workspace splitters. */
export const layoutBounds = {
  inspectorWidth: { min: 220, max: 440 },
  arrangementRatio: { min: 0.2, max: 0.8 },
  expressionHeight: { min: 72, max: 280 },
  trackHeight: { min: 76, max: 180 },
  trackHeaderWidth: { min: 160, max: 340 },
  noteHeight: { min: 14, max: 32 },
  preBufferSeconds: { min: 0.25, max: 2 },
};

const PREFERENCES_KEY = "ichikara.preferences.v1";

function choice<T extends string | number>(value: unknown, values: readonly T[], fallback: T): T {
  return values.find((candidate) => candidate === value) ?? fallback;
}

function normalize(value: unknown): EditorPreferences {
  const preferences = { ...defaultPreferences };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return preferences;
  for (const key of ["autoScroll", "showKeyboard", "showExpression"] as const) {
    if (key in value && typeof Reflect.get(value, key) === "boolean") {
      const candidate: unknown = Reflect.get(value, key);
      if (typeof candidate === "boolean") preferences[key] = candidate;
    }
  }
  for (const key of Object.keys(layoutBounds)) {
    if (!(key in layoutBounds)) continue;
    const field = key as keyof typeof layoutBounds;
    const candidate: unknown = Reflect.get(value, field);
    const bounds = layoutBounds[field];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= bounds.min && candidate <= bounds.max)
      preferences[field] = candidate;
  }
  preferences.followMode = choice(Reflect.get(value, "followMode"), ["page", "smooth"], preferences.followMode);
  preferences.snap = choice(Reflect.get(value, "snap"), ["off", "1/1", "1/2", "1/4", "1/8", "1/16"], preferences.snap);
  preferences.sampleRate = choice(Reflect.get(value, "sampleRate"), [44100, 48000], preferences.sampleRate);
  return preferences;
}

/** Restore validated preferences; corrupt JSON or inaccessible storage throws to the UI. */
export function readPreferences(storage: Pick<Storage, "getItem">): EditorPreferences {
  const source = storage.getItem(PREFERENCES_KEY);
  if (source === null) return { ...defaultPreferences };
  const value: unknown = JSON.parse(source);
  return normalize(value);
}

/** Persist only supported preference fields; storage failures propagate to the caller. */
export function writePreferences(storage: Pick<Storage, "setItem">, preferences: EditorPreferences): void {
  storage.setItem(PREFERENCES_KEY, JSON.stringify(normalize(preferences)));
}
