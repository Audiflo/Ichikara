import assert from "node:assert/strict";
import { it } from "node:test";
import { addTrack, chitoseChika, createProject } from "@audiflo/ichikara";
import { setTrackLanguage } from "../../src/lib/editor/tracks.ts";

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
