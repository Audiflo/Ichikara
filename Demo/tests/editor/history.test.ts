import assert from "node:assert/strict";
import { it } from "node:test";
import { EditorHistory } from "../../src/lib/editor/history.ts";

await it("selection and saving without edits do not consume undo entries", () => {
  const history = new EditorHistory({ name: "Song" });
  history.push({ name: "Song" });
  assert.equal(history.canUndo, false);
  history.push({ name: "Renamed" });
  history.push({ name: "Renamed" });
  assert.deepEqual(history.undo(), { name: "Song" });
  history.push({ name: "Song" });
  assert.equal(history.canRedo, true);
});

await it("restoring and editing a snapshot cannot mutate an earlier undo state", () => {
  const history = new EditorHistory({ notes: [{ lyric: "a" }] });
  history.push({ notes: [{ lyric: "i" }] });
  const restored = history.undo();
  restored.notes[0] = { lyric: "u" };
  history.push(restored);
  assert.deepEqual(history.undo(), { notes: [{ lyric: "a" }] });
  assert.deepEqual(history.redo(), { notes: [{ lyric: "u" }] });
});

await it("deletion is a reversible transaction and branching discards redo", () => {
  const history = new EditorHistory({ notes: ["a", "i"], tempo: 120 });
  history.push({ notes: ["a"], tempo: 120 });
  assert.deepEqual(history.undo().notes, ["a", "i"]);
  assert.deepEqual(history.redo().notes, ["a"]);
  history.undo();
  history.push({ notes: ["a", "i"], tempo: 90 });
  assert.equal(history.canRedo, false);
  assert.equal(history.undo().tempo, 120);
});

await it("reset replaces the document without allowing undo into another project", () => {
  const history = new EditorHistory({ name: "First" });
  history.push({ name: "Renamed" });
  history.reset({ name: "Second" });
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  assert.deepEqual(history.undo(), { name: "Second" });
});
