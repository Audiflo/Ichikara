import { mandarin } from "../../src/langs/mandarin";
import g2pData from "../../src/langs/data/zh-g2p.cjs";

describe("mandarin", () => {
  it("has the correct id and name", () => {
    expect(mandarin.id).toBe("zh");
    expect(mandarin.name).toBe("Mandarin Chinese");
  });

  it("all phonemes have a type and a symbol", () => {
    for (const [key, def] of mandarin.phonemes) {
      expect(def.symbol).toBe(key);
      expect(def.type).toBeDefined();
      expect(["vowel", "consonant", "diphthong", "silence"]).toContain(def.type);
    }
  });

  it("vowels have formants", () => {
    for (const [, def] of mandarin.phonemes) {
      if (def.type === "vowel") {
        expect(def.formants?.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("parses a simple CV syllable (ba)", () => {
    const result = mandarin.lyricToPhonemes("ba");
    expect(result).toEqual(["b", "a"]);
  });

  it("parses a syllable with diphthong (bei)", () => {
    const result = mandarin.lyricToPhonemes("bei");
    expect(result).toEqual(["b", "e", "i"]);
  });

  it("parses a syllable with nasal coda (an)", () => {
    const result = mandarin.lyricToPhonemes("an");
    expect(result).toEqual(["a", "n"]);
  });

  it("parses zhi with retroflex vowel", () => {
    const result = mandarin.lyricToPhonemes("zhi");
    expect(result).toEqual(["zh", "ir"]);
  });

  it("parses zi with dental vowel", () => {
    const result = mandarin.lyricToPhonemes("zi");
    expect(result).toEqual(["z", "iz"]);
  });

  it("parses a triphthong (xiao)", () => {
    const result = mandarin.lyricToPhonemes("xiao");
    expect(result).toEqual(["x", "i", "a", "o"]);
  });

  it("parses ian with a->e mutation (jian)", () => {
    const result = mandarin.lyricToPhonemes("jian");
    expect(result).toEqual(["j", "i", "e", "n"]);
  });

  it("handles yu spelling change", () => {
    const result = mandarin.lyricToPhonemes("yu");
    expect(result).toEqual(["v"]);
  });

  it("handles yue spelling change", () => {
    const result = mandarin.lyricToPhonemes("yue");
    expect(result).toEqual(["v", "e"]);
  });

  it("handles yi spelling change", () => {
    const result = mandarin.lyricToPhonemes("yi");
    expect(result).toEqual(["i"]);
  });

  it("handles wu spelling change", () => {
    const result = mandarin.lyricToPhonemes("wu");
    expect(result).toEqual(["u"]);
  });

  it("handles wa with w spelling change", () => {
    const result = mandarin.lyricToPhonemes("wa");
    expect(result).toEqual(["u", "a"]);
  });

  it("handles tone suffix stripping (ma1)", () => {
    const result = mandarin.lyricToPhonemes("ma1");
    expect(result).toEqual(["m", "a"]);
  });

  it("handles multi-syllable input", () => {
    const result = mandarin.lyricToPhonemes("ni hao");
    expect(result).toEqual(["n", "i", "h", "a", "o"]);
  });

  it("handles empty input", () => {
    const result = mandarin.lyricToPhonemes("");
    expect(result).toEqual([]);
  });

  it.each([
    ["回", "hui"],
    ["年", "nian"],
    ["任", "ren"],
    ["自", "zi"],
    ["诩", "xu"],
    ["古", "gu"],
    ["狂", "kuang"],
    ["你好", "ni hao"],
    ["中国人", "zhong guo ren"],
  ])("converts Han lyric %s to its pinyin reading", (han, pinyin) => {
    expect(mandarin.lyricToPhonemes(han)).toEqual(mandarin.lyricToPhonemes(pinyin));
  });

  it("normalizes tone marks and per-syllable tone numbers", () => {
    expect(mandarin.lyricToPhonemes("ni3 hao3")).toEqual(["n", "i", "h", "a", "o"]);
    expect(mandarin.lyricToPhonemes("ní hǎo")).toEqual(["n", "i", "h", "a", "o"]);
    expect(mandarin.lyricToPhonemes("lǜ")).toEqual(["l", "v"]);
  });

  it("prefers phrase readings for polyphonic words", () => {
    expect(mandarin.lyricToPhonemes("音乐")).toEqual(mandarin.lyricToPhonemes("yin1 yue4"));
    expect(mandarin.lyricToPhonemes("重庆")).toEqual(mandarin.lyricToPhonemes("chong2 qing4"));
  });

  it("emits only known phonemes for every generated reading", () => {
    for (const readings of Object.values(g2pData)) {
      for (const syllable of readings) {
        for (const phoneme of mandarin.lyricToPhonemes(syllable)) {
          expect(mandarin.phonemes.has(phoneme)).toBe(true);
        }
      }
    }
  });

  it("only emits known phonemes for Han lyrics", () => {
    for (const lyric of ["回", "年", "你好", "中国人"]) {
      for (const phoneme of mandarin.lyricToPhonemes(lyric)) {
        expect(mandarin.phonemes.has(phoneme)).toBe(true);
      }
    }
  });

  it.each([
    ["you", ["i", "o", "u"]],
    ["wei", ["u", "e", "i"]],
    ["wen", ["u", "e", "n"]],
    ["ying", ["i", "ng"]],
    ["yu", ["v"]],
  ])("uses the distinct zero-onset spelling %s in reclists", (alias, phonemes) => {
    const cv = mandarin.reclist?.("cv") ?? [];
    expect(cv.filter((entry) => entry.alias === alias)).toEqual([{ alias, phonemes }]);
    const vcv = mandarin.reclist?.("vcv") ?? [];
    expect(vcv.filter((entry) => entry.alias === `- ${alias}`)).toEqual([{ alias: `- ${alias}`, phonemes }]);
  });

  it("all output phonemes exist in the phoneme map", () => {
    const testSyllables = [
      "ba",
      "po",
      "mi",
      "fa",
      "da",
      "ta",
      "na",
      "la",
      "ga",
      "ka",
      "ha",
      "zhi",
      "chi",
      "shi",
      "ri",
      "zi",
      "ci",
      "si",
      "ju",
      "qu",
      "xu",
      "zhuang",
      "shuang",
      "qiong",
      "xuan",
      "yue",
      "yun",
      "er",
    ];
    for (const syl of testSyllables) {
      const phonemes = mandarin.lyricToPhonemes(syl);
      for (const p of phonemes) {
        expect(mandarin.phonemes.has(p)).toBe(true);
      }
    }
  });
});

describe("mandarin rests", () => {
  it("maps the UTAU rest marker to the silence phoneme", () => {
    expect(mandarin.lyricToPhonemes("R")).toEqual(["sil"]);
  });

  it("defines the rest phoneme as unvoiced silence", () => {
    const def = mandarin.phonemes.get("sil");
    expect(def?.type).toBe("silence");
    expect(def?.voiced).toBe(false);
  });

  it("does not parse the rest marker as the pinyin syllable r", () => {
    const symbols = mandarin.lyricToPhonemes("R");
    expect(symbols).toEqual(["sil"]);
  });
});
