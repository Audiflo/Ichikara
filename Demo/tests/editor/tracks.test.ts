import assert from "node:assert/strict";
import { it } from "node:test";
import { addPart, addTrack, chitoseChika, createProject } from "@audiflo/ichikara";
import { applyTrackLanguages, detectProjectLanguages, setTrackLanguage } from "../../src/lib/editor/tracks.ts";

let nextId = 0;
const id = (): string => `id-${++nextId}`;

await it("sets the selected track language by id without changing other tracks", () => {
  const project = createProject("Song", id);
  const first = addTrack(project, "One", chitoseChika, "jp", id);
  const second = addTrack(project, "Two", chitoseChika, "jp", id);

  assert.equal(setTrackLanguage(project, second.id, "en"), true);
  assert.equal(first.language, "jp");
  assert.equal(second.language, "en");
});

await it("detects a distinct language for each track from its lyrics", () => {
  const project = createProject("Song", id);
  const japanese = addTrack(project, "One", chitoseChika, "jp", id);
  const english = addTrack(project, "Two", chitoseChika, "jp", id);
  const mandarin = addTrack(project, "Three", chitoseChika, "jp", id);
  for (const [track, lyric] of [
    [japanese, "こんにちは"],
    [english, "hello"],
    [mandarin, "你好"],
  ] as const) {
    const part = addPart(track, "Verse", 0, 480, id);
    part.notes.push({ id: id(), lyric, noteNum: 60, length: 480, tick: 0 });
  }

  assert.deepEqual(detectProjectLanguages(project), ["jp", "en", "zh"]);
});

await it("applies only the languages provided by the import picker", () => {
  const project = createProject("Song", id);
  addTrack(project, "One", chitoseChika, "jp", id);
  addTrack(project, "Two", chitoseChika, "jp", id);
  addTrack(project, "Three", chitoseChika, "jp", id);

  applyTrackLanguages(project, ["en", "zh"]);
  assert.deepEqual(project.tracks.map((track) => track.language), ["en", "zh", "jp"]);
});
