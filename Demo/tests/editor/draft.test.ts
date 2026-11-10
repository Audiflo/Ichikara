import assert from "node:assert/strict";
import { it } from "node:test";
import { createProject, serializeProject } from "ichikara";
import { readDraft, writeDraft } from "../../src/lib/editor/draft.ts";

function storage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

await it("recovers the edited document and its last saved state independently", () => {
  const store = storage();
  const project = createProject("Saved", () => "song");
  const savedDocument = serializeProject(project);
  project.name = "Edited";
  writeDraft(store, project, savedDocument);
  const recovered = readDraft(store);
  assert.equal(recovered?.project.name, "Edited");
  assert.equal(recovered.savedDocument, savedDocument);
});

await it("returns no draft for a fresh store and rejects corrupt recovery data", () => {
  assert.equal(readDraft(storage()), null);
  assert.throws(() => readDraft({ getItem: () => '{"project":{}}' }), /draft/i);
});

await it("propagates storage failures so the editor can report that recovery is unavailable", () => {
  const project = createProject("Song", () => "song");
  assert.throws(
    () =>
      writeDraft(
        {
          setItem: () => {
            throw new Error("Quota exceeded");
          },
        },
        project,
        serializeProject(project),
      ),
    /Quota/,
  );
});
