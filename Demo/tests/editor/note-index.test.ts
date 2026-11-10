import assert from "node:assert/strict";
import { it } from "node:test";
import { createNoteIndex, visibleNotes } from "../../src/lib/editor/note-index.ts";

const notes = [
  { id: "late", tick: 960, length: 480, noteNum: 60, lyric: "a" },
  { id: "sustain", tick: 0, length: 1920, noteNum: 64, lyric: "i" },
  { id: "short", tick: 240, length: 120, noteNum: 67, lyric: "u" },
];

await it("finds sustaining notes that start before the viewport without changing source order", () => {
  const index = createNoteIndex(notes);
  assert.deepEqual(
    visibleNotes(index, 1000, 1200).map((entry) => entry.index),
    [1, 0],
  );
  assert.deepEqual(
    notes.map((note) => note.id),
    ["late", "sustain", "short"],
  );
});

await it("excludes notes outside the viewport and handles an empty score", () => {
  assert.deepEqual(visibleNotes(createNoteIndex(notes), 2000, 2500), []);
  assert.deepEqual(visibleNotes(createNoteIndex([]), 0, 480), []);
  assert.deepEqual(
    visibleNotes(createNoteIndex(notes), 500, 800).map((entry) => entry.index),
    [1],
  );
});
