import { createProject, addTrack, addPart } from "../../src/project/document";
import { projectToUfData, ufDataToProject } from "../../src/project/interchange";
import { chitoseChika } from "../../src/voices";
import { elementAt } from "../../src/core/validation";

describe("song interchange", () => {
  it("preserves every track, region placement, tempo, meter and explicit phoneme", () => {
    let counter = 0;
    const id = () => `interchange-${counter++}`;
    const project = createProject("Duet", id);
    project.resolution = 960;
    project.tempos.push({ tick: 3840, tempo: 90 });
    project.meters.push({ tick: 3840, numerator: 3, denominator: 4 });
    for (const name of ["Lead", "Harmony"]) {
      const track = addTrack(project, name, chitoseChika, "jp", id);
      const part = addPart(track, "Verse", 1920, 1920, id);
      part.notes.push({ id: id(), lyric: "a", phonemes: ["a"], noteNum: 60, tick: 480, length: 960 });
    }
    const data = projectToUfData(project);
    expect(data.project.tracks.map((track) => track.name)).toEqual(["Lead", "Harmony"]);
    expect(elementAt(data.project.tracks, 1).notes[0]?.tickOn).toBe(1200);
    expect(data.project.timeSignatures).toEqual([
      { measurePosition: 0, numerator: 4, denominator: 4 },
      { measurePosition: 1, numerator: 3, denominator: 4 },
    ]);
    const restored = ufDataToProject(data, "jp", id);
    expect(restored.tracks.map((track) => track.name)).toEqual(["Lead", "Harmony"]);
    expect(elementAt(elementAt(elementAt(restored.tracks, 1).parts, 0).notes, 0).phonemes).toEqual(["a"]);
    expect(restored.meters[1]).toEqual({ tick: 1920, numerator: 3, denominator: 4 });
    expect(restored.tempos[1]).toEqual({ tick: 1920, tempo: 90 });
  });
});
