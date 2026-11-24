import { parseUfData } from "../../src/import/ufdata";
import { importProjectFromFiles } from "../../src/project/interchange";

function ustText(lyric: string, noteNum: number): string {
  return [
    "[#VERSION]",
    "UST Version1.2",
    "[#SETTING]",
    "Tempo=120.00",
    "Tracks=1",
    "Mode2=True",
    "[#0000]",
    "Length=480",
    `Lyric=${lyric}`,
    `NoteNum=${noteNum}`,
    "PreUtterance=",
    "[#TRACKEND]",
    "",
  ].join("\r\n");
}

function ustFile(name: string, lyric: string, noteNum: number): File {
  return new File([ustText(lyric, noteNum)], `${name}.ust`, { type: "text/plain" });
}

describe("multi-file import", () => {
  it("parses several UST files into one interchange document", async () => {
    const files = [ustFile("First", "a", 60), ustFile("Second", "i", 64)];
    const data = await parseUfData(files, files.map((file) => file.name));
    expect(data.project.tracks.map((track) => [track.name, track.notes[0]?.lyric])).toEqual([
      ["First", "a"],
      ["Second", "i"],
    ]);
  });

  it("imports each UST file as a separate native track", async () => {
    let counter = 0;
    const id = () => `multi-${counter++}`;
    const files = [ustFile("First", "a", 60), ustFile("Second", "i", 64)];
    const project = await importProjectFromFiles(files, "jp", id);
    expect(project.tracks.map((track) => track.name)).toEqual(["First", "Second"]);
    expect(project.tracks.map((track) => track.parts[0]?.notes[0]?.lyric)).toEqual(["a", "i"]);
    expect(project.tracks.map((track) => track.parts[0]?.notes[0]?.noteNum)).toEqual([60, 64]);
  });

  it("rejects a batch with mixed file formats", async () => {
    const mixed = [ustFile("First", "a", 60), new File(["not a ust"], "Notes.mid")];
    await expect(importProjectFromFiles(mixed, "jp", () => "id")).rejects.toThrow("Multi-file import requires all files to share one format");
  });

  it("rejects a batch in an unsupported format", async () => {
    const files = [new File(["not a ust"], "One.mid"), new File(["not a ust"], "Two.mid")];
    await expect(importProjectFromFiles(files, "jp", () => "id")).rejects.toThrow("Multi-file import does not support .mid");
  });
});
