import { createProject, addTrack, addPart } from "../../src/project/document";
import { appendProject } from "../../src/project/merge";
import { validateProject } from "../../src/project/validation";
import { chitoseChika, chitoseSho } from "../../src/voices";
import { elementAt } from "../../src/core/validation";

function idFactory(prefix: string): () => string {
  let counter = 0;
  return () => `${prefix}-${counter++}`;
}

function noteProject(name: string, trackName: string, options: { resolution?: number; tempo?: number; part?: boolean } = {}) {
  const id = idFactory(name);
  const project = createProject(name, id);
  project.resolution = options.resolution ?? 480;
  project.tempos = [{ tick: 0, tempo: options.tempo ?? 120 }];
  const track = addTrack(project, trackName, chitoseChika, "jp", id);
  if (options.part !== false) {
    const part = addPart(track, "Existing", 0, 1920, id);
    part.notes.push({ id: id(), lyric: "a", noteNum: 60, tick: 0, length: 480 });
  }
  return { project, track, id };
}

describe("appendProject", () => {
  it("converts source timing through real time and preserves the target timeline", () => {
    const target = noteProject("Target", "Lead").project;
    const source = noteProject("Source", "Guest", { resolution: 240, tempo: 60, part: false }).project;
    const sourceTrack = elementAt(source.tracks, 0);
    const sourcePart = addPart(sourceTrack, "Verse", 0, 480, () => "source-part");
    sourcePart.notes.push({
      id: "source-note",
      lyric: "a",
      noteNum: 60,
      tick: 0,
      length: 480,
      pitchBend: { ticks: [0, 240, 480], values: [0, 1, 0] },
    });
    const targetPart = elementAt(elementAt(target.tracks, 0).parts, 0);

    appendProject(target, source, idFactory("merged"));

    expect(target.resolution).toBe(480);
    expect(target.tempos).toEqual([{ tick: 0, tempo: 120 }]);
    expect(targetPart.tick).toBe(0);
    const appended = elementAt(target.tracks, 1);
    expect(elementAt(appended.parts, 0).tick).toBe(targetPart.length);
    expect(elementAt(appended.parts, 0).length).toBe(1920);
    const note = elementAt(elementAt(appended.parts, 0).notes, 0);
    expect(note.tick).toBe(0);
    expect(note.length).toBe(1920);
    expect(note.pitchBend).toEqual({ ticks: [0, 960, 1920], values: [0, 1, 0] });
  });

  it("uses source tempo changes when placing appended notes", () => {
    const target = noteProject("Target", "Lead").project;
    const source = noteProject("Source", "Guest", { resolution: 240, tempo: 60, part: false }).project;
    source.tempos.push({ tick: 240, tempo: 120 });
    const sourcePart = addPart(elementAt(source.tracks, 0), "Verse", 240, 240, () => "source-part");
    sourcePart.notes.push({ id: "source-note", lyric: "a", noteNum: 60, tick: 0, length: 240 });

    appendProject(target, source, idFactory("merged"));

    const appended = elementAt(target.tracks, 1);
    expect(elementAt(appended.parts, 0).tick).toBe(2880);
    expect(elementAt(appended.parts, 0).length).toBe(480);
  });

  it("regenerates identities, deduplicates names, and keeps track settings", () => {
    const { project: target, id } = noteProject("Target", "Lead");
    const source = noteProject("Source", "Lead").project;
    elementAt(source.tracks, 0).voice = structuredClone(chitoseSho);
    elementAt(source.tracks, 0).gain = 0.75;
    const second = addTrack(source, "Harmony", chitoseSho, "en", id);
    second.pan = -0.5;

    appendProject(target, source, idFactory("merged"));

    expect(target.tracks.map((track) => track.name)).toEqual(["Lead", "Lead (2)", "Harmony"]);
    expect(elementAt(target.tracks, 1).voice).toEqual(chitoseSho);
    expect(elementAt(target.tracks, 1).gain).toBe(0.75);
    expect(elementAt(target.tracks, 2).language).toBe("en");
    expect(elementAt(target.tracks, 2).pan).toBe(-0.5);
    expect(elementAt(source.tracks, 0).id).toBe("Source-1");
    expect(() => validateProject(target)).not.toThrow();
  });

  it("appends every part of a track at the project end", () => {
    const target = noteProject("Target", "Lead").project;
    const source = noteProject("Source", "Guest", { part: false }).project;
    const sourceTrack = elementAt(source.tracks, 0);
    addPart(sourceTrack, "First", 0, 480, () => "part-1");
    addPart(sourceTrack, "Second", 960, 480, () => "part-2");
    const targetEnd = elementAt(elementAt(target.tracks, 0).parts, 0).length;

    appendProject(target, source, idFactory("merged"));

    expect(elementAt(target.tracks, 1).parts.map((part) => part.tick)).toEqual([targetEnd, targetEnd + 960]);
  });
});
