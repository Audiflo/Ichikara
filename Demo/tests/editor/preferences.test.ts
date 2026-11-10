import assert from "node:assert/strict";
import { it } from "node:test";
import { defaultPreferences, readPreferences, writePreferences } from "../../src/lib/editor/preferences.ts";
import { followPosition } from "../../src/lib/editor/viewport.ts";

await it("restores valid preferences and bounds malformed layout values", () => {
  const preferences = readPreferences({
    getItem: () =>
      JSON.stringify({ autoScroll: false, followMode: "smooth", inspectorWidth: 9999, trackHeight: -10, sampleRate: 123, snap: "invalid" }),
  });
  assert.equal(preferences.autoScroll, false);
  assert.equal(preferences.followMode, "smooth");
  assert.equal(preferences.inspectorWidth, defaultPreferences.inspectorWidth);
  assert.equal(preferences.trackHeight, defaultPreferences.trackHeight);
  assert.equal(preferences.sampleRate, defaultPreferences.sampleRate);
  assert.equal(preferences.snap, defaultPreferences.snap);
});

await it("persists independent preferences without adding project data", () => {
  let saved = "";
  writePreferences(
    {
      setItem: (_key, value) => {
        saved = value;
      },
    },
    { ...defaultPreferences, autoScroll: false, expressionHeight: 160 },
  );
  const restored = readPreferences({ getItem: () => saved });
  assert.equal(restored.expressionHeight, 160);
  assert.equal(restored.autoScroll, false);
  assert.equal(defaultPreferences.autoScroll, true);
  assert.throws(() => readPreferences({ getItem: () => "{" }));
});

await it("page follow retains the viewport until the playhead reaches its edge", () => {
  assert.equal(followPosition(200, 0, 800, 2000, "page"), 0);
  assert.equal(followPosition(750, 0, 800, 2000, "page"), 670);
  assert.equal(followPosition(20, 670, 800, 2000, "page"), 0);
});

await it("smooth follow keeps the playhead in view and clamps short content", () => {
  assert.equal(followPosition(600, 0, 900, 2400, "smooth"), 300);
  assert.equal(followPosition(600, 0, 900, 400, "smooth"), 0);
  assert.equal(followPosition(2400, 0, 900, 2400, "smooth"), 1500);
});
