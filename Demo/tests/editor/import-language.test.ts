import assert from "node:assert/strict";
import { it } from "node:test";
import type { UfData } from "@audiflo/ichikara";
import { buildImportProject, planImportLanguages, setImportLanguage } from "../../src/lib/editor/import-language.ts";

let nextId = 0;
const id = (): string => `id-${++nextId}`;

const note = (lyric: string, tick: number, phoneme?: string) => ({
  key: 60,
  tickOn: tick,
  tickOff: tick + 480,
  lyric,
  ...(phoneme ? { phoneme } : {}),
});

const data: UfData = {
  formatVersion: 1,
  project: {
    name: "Duet",
    tracks: [
      { name: "English", notes: [note("hello", 0), note("world", 480)] },
      { name: "Japanese", notes: [note("こんにちは", 0), note("せかい", 480)] },
    ],
    tempos: [{ tickPosition: 0, bpm: 120 }],
    measurePrefix: 0,
  },
};

await it("plans a review for multilingual imports with detected track languages", () => {
  const plan = planImportLanguages(data);

  assert.equal(plan.needsReview, true);
  assert.deepEqual(
    plan.choices.map((choice) => choice.language),
    ["en", "jp"],
  );
  assert.equal(plan.choices[0]?.detected.confident, true);
});

await it("changes one track language in an import plan", () => {
  const plan = planImportLanguages(data);

  assert.equal(setImportLanguage(plan, 1, "zh"), true);
  assert.equal(plan.choices[1]?.language, "zh");
  assert.equal(plan.choices[0]?.language, "en");
});

await it("builds a project using the reviewed per-track languages", () => {
  const plan = planImportLanguages(data);
  setImportLanguage(plan, 0, "zh");

  const project = buildImportProject(plan, id);

  assert.deepEqual(
    project.tracks.map((track) => track.language),
    ["zh", "jp"],
  );
});
