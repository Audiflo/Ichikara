import { detectUfDataLanguages, detectUfTrackLanguage } from "../../src/import/language";
import { elementAt } from "../../src/core/validation";
import type { UfData } from "../../src/import/ufdata";

function dataWithNotes(notes: { lyric: string; phoneme?: string }[]): UfData {
  return {
    formatVersion: 1,
    project: {
      name: "Test",
      tracks: [
        {
          name: "Vocal",
          notes: notes.map((note, index) => ({
            key: 60,
            tickOn: index * 480,
            tickOff: (index + 1) * 480,
            lyric: note.lyric,
            ...(note.phoneme ? { phoneme: note.phoneme } : {}),
          })),
        },
      ],
      tempos: [{ tickPosition: 0, bpm: 120 }],
      measurePrefix: 0,
    },
  };
}

const firstTrack = (data: UfData) => elementAt(data.project.tracks, 0);

describe("import language detection", () => {
  it("detects English from VOCALOID X-SAMPA phonemes", () => {
    const data = dataWithNotes([
      { lyric: "hello", phoneme: "h e l0 oU" },
      { lyric: "world", phoneme: "w @r l d" },
    ]);

    expect(detectUfTrackLanguage(firstTrack(data))).toEqual({ language: "en", confident: true });
    expect(detectUfDataLanguages(data)).toEqual([{ language: "en", confident: true }]);
  });

  it("detects English from dictionary lyrics", () => {
    const data = dataWithNotes([{ lyric: "hello" }, { lyric: "world" }]);

    expect(detectUfTrackLanguage(firstTrack(data)).language).toBe("en");
  });

  it("detects Japanese from kana lyrics", () => {
    const data = dataWithNotes([{ lyric: "こんにちは" }, { lyric: "せかい" }]);

    expect(detectUfTrackLanguage(firstTrack(data))).toEqual({ language: "jp", confident: true });
  });

  it("detects Japanese from romaji CV lyrics", () => {
    const data = dataWithNotes([{ lyric: "ka" }, { lyric: "ki" }, { lyric: "ku" }, { lyric: "sa" }]);

    expect(detectUfTrackLanguage(firstTrack(data))).toEqual({ language: "jp", confident: true });
  });

  it("detects Mandarin from Han lyrics", () => {
    const data = dataWithNotes([{ lyric: "你好" }, { lyric: "世界" }]);

    expect(detectUfTrackLanguage(firstTrack(data))).toEqual({ language: "zh", confident: true });
  });

  it("does not treat rest markers or romaji phonemes as English evidence", () => {
    const data = dataWithNotes([
      { lyric: "a", phoneme: "- e" },
      { lyric: "i", phoneme: "- i" },
      { lyric: "u", phoneme: "- u" },
      { lyric: "e", phoneme: "- e" },
    ]);

    expect(detectUfTrackLanguage(firstTrack(data)).language).toBe("jp");
  });

  it("marks empty tracks as uncertain", () => {
    const data = dataWithNotes([{ lyric: "-" }, { lyric: "-" }]);

    expect(detectUfTrackLanguage(firstTrack(data)).confident).toBe(false);
  });
});
