import { createProject, addPart, addTrack } from "../../src/project/document";
import { streamProject } from "../../src/project/render";
import { buildVoice } from "../../src/voices";
import type { AudioChunk } from "../../src/core/types";
import { elementAt } from "../../src/core/validation";

describe("song rendering", () => {
  it("merges regions in absolute order and applies track pan and gain", async () => {
    let next = 0;
    const id = () => `render-${next++}`;
    const project = createProject("Song", id);
    const voice = buildVoice();
    const late = addTrack(project, "Late", voice, "jp", id);
    const early = addTrack(project, "Early", voice, "jp", id);
    late.pan = 1;
    early.pan = -1;
    const latePart = addPart(late, "Later", 480, 480, id);
    const earlyPart = addPart(early, "First", 0, 480, id);
    latePart.notes.push({ id: id(), tick: 0, length: 48, lyric: "a", noteNum: 60 });
    earlyPart.notes.push({ id: id(), tick: 0, length: 48, lyric: "a", noteNum: 64 });
    const chunks: AudioChunk[] = [];
    for await (const chunk of streamProject(project, 8000)) chunks.push(chunk);
    expect(chunks.map((chunk) => chunk.startSample)).toEqual([0, 4000]);
    expect(elementAt(elementAt(chunks, 0).data, 1).every((value) => value === 0)).toBe(true);
    expect(elementAt(elementAt(chunks, 1).data, 0).every((value) => value === 0)).toBe(true);
    expect(elementAt(elementAt(chunks, 0).data, 0).some((value) => value !== 0)).toBe(true);

    late.solo = true;
    late.gain = 0;
    const solo: AudioChunk[] = [];
    for await (const chunk of streamProject(project, 8000)) solo.push(chunk);
    expect(solo).toHaveLength(1);
    expect(elementAt(solo, 0).data.every((channel) => channel.every((value) => value === 0))).toBe(true);
    late.mute = true;
    const muted: AudioChunk[] = [];
    for await (const chunk of streamProject(project, 8000)) muted.push(chunk);
    expect(muted).toHaveLength(0);
  });
});
