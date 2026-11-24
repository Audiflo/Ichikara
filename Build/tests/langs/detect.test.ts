import { detectLanguage, listLanguages } from "../../src/langs/index";
import { japanese } from "../../src/langs/japanese";
import { english } from "../../src/langs/english";
import { mandarin } from "../../src/langs/mandarin";

describe("language detection", () => {
  it("detects Japanese from kana lyrics", () => {
    expect(detectLanguage(["こんにちは", "世界"])).toBe("jp");
  });
  it("detects Mandarin from Han lyrics without kana", () => {
    expect(detectLanguage(["你好", "世界"])).toBe("zh");
  });
  it("detects English from Latin lyrics", () => {
    expect(detectLanguage(["hello", "the", "world"])).toBe("en");
  });
  it("detects romaji as Japanese rather than English", () => {
    expect(detectLanguage(["ka", "ki", "ku", "ke", "ko"])).toBe("jp");
    expect(detectLanguage(["konnichiwa", "arigatou", "sayonara"])).toBe("jp");
    expect(detectLanguage(["shi", "chi", "tsu", "fu"])).toBe("jp");
  });
  it("detects pinyin as Mandarin", () => {
    expect(detectLanguage(["ni", "hao", "zhong", "guo"])).toBe("zh");
    expect(detectLanguage(["wo", "ai", "ni"])).toBe("zh");
    expect(detectLanguage(["xie", "xie"])).toBe("zh");
  });
  it("uses romaji-specific spelling to resolve ambiguous syllables", () => {
    expect(detectLanguage(["aishiteru"])).toBe("jp");
    expect(detectLanguage(["shi", "chi", "tsu", "fu"])).toBe("jp");
  });
  it("returns the fallback when no lyrics carry a script", () => {
    expect(detectLanguage(["-", "-"])).toBe("jp");
    expect(detectLanguage([], "en")).toBe("en");
  });
  it("prefers Japanese over Mandarin when kana accompanies kanji", () => {
    expect(detectLanguage(["日本語", "を", "話す"])).toBe("jp");
  });
  it("collapses registry aliases when listing languages", () => {
    expect(listLanguages()).toEqual([japanese, english, mandarin]);
  });
});
