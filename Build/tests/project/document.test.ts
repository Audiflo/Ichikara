import { createProject, addTrack, addPart, projectFromScore, parseProject, serializeProject } from "../../src/project/document";
import { chitoseChika } from "../../src/voices";
import { elementAt } from "../../src/core/validation";

function ids(): () => string {
  let next = 0;
  return () => `id-${next++}`;
}

describe("native projects", () => {
  it.each([{ fScale: -1 }, { oq: 2 }, { breathiness: -0.1 }, { vRate: -1 }, { gender: 3 }])(
    "rejects out-of-range voice controls %j",
    (parameters) => {
      const id = ids();
      const project = createProject("Song", id);
      const track = addTrack(project, "Lead", chitoseChika, "jp", id);
      track.parameters = parameters;
      expect(() => serializeProject(project)).toThrow(/parameters/i);
    },
  );
  it("creates independent tracks, parts, voices, and stable note identities", () => {
    const id = ids();
    const project = createProject("Song", id);
    const track = addTrack(project, "Lead", chitoseChika, "jp", id);
    const part = addPart(track, "Verse", 1920, 1920, id);
    expect(new Set([project.id, track.id, part.id]).size).toBe(3);
    track.voice.formant.scale = 2;
    expect(chitoseChika.formant.scale).not.toBe(2);
  });

  it("round trips all note expression, tempo, meter, voice and mix settings", () => {
    const project = projectFromScore(
      {
        resolution: 960,
        voice: chitoseChika.name,
        tempos: [
          { tick: 0, tempo: 120 },
          { tick: 1920, tempo: 90 },
        ],
        notes: [
          {
            lyric: "hi",
            noteNum: 60,
            length: 960,
            velocity: 90,
            intensity: 80,
            modulation: 20,
            pitchAccent: 0.3,
            vibratoOverride: { rate: 6, depth: 12, attack: 0.2 },
            pitchBend: { ticks: [0, 480, 960], values: [-1, 0, 1] },
          },
        ],
      },
      "Song",
      "en",
      ids(),
    );
    const track = elementAt(project.tracks, 0);
    track.gain = 0.75;
    track.pan = -0.25;
    track.solo = true;
    project.meters.push({ tick: 3840, numerator: 3, denominator: 4 });
    expect(parseProject(serializeProject(project))).toEqual(project);
  });

  it("materializes implicit note positions without losing score resolution", () => {
    const project = projectFromScore(
      {
        resolution: 96,
        tempos: [],
        notes: [
          { lyric: "a", noteNum: 60, length: 96 },
          { lyric: "i", noteNum: 62, length: 48 },
          { lyric: "u", noteNum: 64, tick: 240, length: 96 },
        ],
      },
      "Import",
      "jp",
      ids(),
    );
    const part = elementAt(elementAt(project.tracks, 0).parts, 0);
    expect(project.resolution).toBe(96);
    expect(part.notes.map((note) => note.tick)).toEqual([0, 96, 240]);
    expect(new Set(part.notes.map((note) => note.id)).size).toBe(3);
  });

  it.each([
    (value: Record<string, unknown>) => {
      value["version"] = 99;
    },
    (value: Record<string, unknown>) => {
      value["resolution"] = 0;
    },
    (value: Record<string, unknown>) => {
      value["tempos"] = [{ tick: 0, tempo: -1 }];
    },
    (value: Record<string, unknown>) => {
      value["meters"] = [{ tick: 0, numerator: 4, denominator: 3 }];
    },
    (value: Record<string, unknown>) => {
      value["tracks"] = [{ id: "broken" }];
    },
  ])("rejects invalid native documents at the load boundary", (corrupt) => {
    const value: Record<string, unknown> = { ...createProject("Song", ids()) };
    corrupt(value);
    expect(() => parseProject(JSON.stringify(value))).toThrow();
  });

  it("rejects duplicate identities, mismatched pitch arrays, and out-of-part notes", () => {
    const project = projectFromScore(
      { resolution: 480, tempos: [], notes: [{ lyric: "a", noteNum: 60, length: 480 }] },
      "Song",
      "jp",
      ids(),
    );
    const part = elementAt(elementAt(project.tracks, 0).parts, 0);
    const note = elementAt(part.notes, 0);
    const originalId = note.id;
    note.id = part.id;
    expect(() => serializeProject(project)).toThrow(/id/i);
    note.id = originalId;
    note.pitchBend = { ticks: [0], values: [] };
    expect(() => serializeProject(project)).toThrow(/pitch/i);
    delete note.pitchBend;
    note.tick = part.length;
    expect(() => serializeProject(project)).toThrow(/part/i);
  });
});
