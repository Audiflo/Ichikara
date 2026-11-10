import assert from "node:assert/strict";
import { it } from "node:test";
import { constrainPane } from "../../src/lib/editor/layout.ts";

await it("reserves editing space when a preferred pane exceeds the viewport", () => {
  assert.deepEqual(constrainPane(560, 700, 170, 800, 260), { min: 170, max: 440, value: 440 });
  assert.deepEqual(constrainPane(280, 340, 72, 280, 130), { min: 72, max: 210, value: 210 });
});

await it("retains a valid preference and applies the configured maximum", () => {
  assert.deepEqual(constrainPane(258, 1440, 220, 440, 286), { min: 220, max: 440, value: 258 });
  assert.deepEqual(constrainPane(500, 1440, 220, 440, 286), { min: 220, max: 440, value: 440 });
});

await it("retains minimum pane sizes until the container has been measured", () => {
  assert.deepEqual(constrainPane(104, 0, 72, 280, 130), { min: 72, max: 72, value: 72 });
  assert.deepEqual(constrainPane(10, 500, 72, 280, 130), { min: 72, max: 280, value: 72 });
});
