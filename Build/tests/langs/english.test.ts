import { ARPABET, convert, VOCALOID_SAMPA } from "@audiflo/phonematix";
import { english } from "../../src/langs/english";
import g2pData from "../../src/langs/data/en-g2p.cjs";

describe("english", () => {
  it("splits fallback x into defined consonants for an unknown word", () => {
    expect(english.lyricToPhonemes("xxqxx")).toEqual(["K", "S", "K", "S", "K", "K", "S", "K", "S"]);
  });

  it("has the correct id and name", () => {
    expect(english.id).toBe("en");
    expect(english.name).toBe("English");
  });

  it("parses a simple word into phonemes", () => {
    const result = english.lyricToPhonemes("HELLO");
    expect(result.length).toBeGreaterThan(1);
    for (const s of result) {
      expect(english.phonemes.has(s)).toBe(true);
    }
  });

  it("parses a CVC word", () => {
    const result = english.lyricToPhonemes("TEST");
    expect(result.length).toBeGreaterThan(1);
  });

  it("handles silence (R)", () => {
    const result = english.lyricToPhonemes("R");
    expect(result).toEqual(["sil"]);
  });

  it("all phonemes have a type and a symbol", () => {
    for (const [, def] of english.phonemes) {
      expect(def.symbol === "sil" || /^[A-Z]+$/.test(def.symbol)).toBe(true);
      expect(def.type).toBeDefined();
      expect(["vowel", "consonant", "diphthong", "silence"]).toContain(def.type);
    }
  });

  it("defines lowercase aliases for ARPAbet phonemes", () => {
    for (const symbol of ["hh", "ah", "l", "ow", "sil"]) {
      expect(english.phonemes.has(symbol)).toBe(true);
    }
    expect(english.phonemes.get("hh")).toBe(english.phonemes.get("HH"));
    expect(english.phonemes.get("sil")).toBe(english.phonemes.get("SIL"));
  });

  it("resolves Vocaloid X-SAMPA phonemes used by imported projects", () => {
    const aliases: Record<string, string[]> = {
      "-": ["SIL"],
      Sil: ["SIL"],
      "@": ["AH"],
      "@U": ["OW"],
      "@r": ["ER"],
      D: ["DH"],
      I: ["IH"],
      "I@": ["IH", "R"],
      N: ["NG"],
      "O:": ["AO"],
      "O@": ["AO", "R"],
      Q: ["AA"],
      T: ["TH"],
      U: ["UH"],
      V: ["AH"],
      aI: ["AY"],
      aU: ["AW"],
      b: ["B"],
      bh: ["B"],
      d: ["D"],
      dh: ["D"],
      e: ["EH"],
      "e@": ["EH", "R"],
      eI: ["EY"],
      f: ["F"],
      g: ["G"],
      gh: ["G"],
      h: ["HH"],
      "i:": ["IY"],
      j: ["Y"],
      k: ["K"],
      kh: ["K"],
      l: ["L"],
      l0: ["L"],
      m: ["M"],
      n: ["N"],
      p: ["P"],
      ph: ["P"],
      r: ["R"],
      s: ["S"],
      t: ["T"],
      tS: ["CH"],
      th: ["T"],
      "u:": ["UW"],
      v: ["V"],
      w: ["W"],
      z: ["Z"],
      "{": ["AE"],
    };
    for (const [alias, expected] of Object.entries(aliases)) {
      expect(convert([alias], { from: VOCALOID_SAMPA, to: ARPABET })).toEqual(expected);
      expect(english.expandPhonemes?.([alias])).toEqual(expected);
      for (const symbol of expected) expect(english.phonemes.has(symbol)).toBe(true);
    }
  });

  it("vowels have formants", () => {
    for (const [, def] of english.phonemes) {
      if (def.type === "vowel") {
        expect(def.formants?.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("preserves an explicit ARPAbet phoneme sequence", () => {
    expect(english.lyricToPhonemes("HH AH L OW")).toEqual(["HH", "AH", "L", "OW"]);
  });

  it("does not read inherited properties from the g2p lexicon", () => {
    expect(() => english.lyricToPhonemes("__proto__")).not.toThrow();
  });

  it("handles consonant clusters", () => {
    const result = english.lyricToPhonemes("WORLD");
    expect(result.length).toBeGreaterThan(2);
  });

  it("handles single-letter words like A", () => {
    const result = english.lyricToPhonemes("A");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("looks up a word from CMUDict (ABBOTT)", () => {
    const result = english.lyricToPhonemes("ABBOTT");
    expect(result.length).toBeGreaterThan(0);
    for (const s of result) {
      expect(english.phonemes.has(s)).toBe(true);
    }
  });

  it("looks up AMERICAN from CMUDict", () => {
    const result = english.lyricToPhonemes("AMERICAN");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("english rests", () => {
  it("maps the UTAU rest marker to the silence phoneme", () => {
    expect(english.lyricToPhonemes("R")).toEqual(["sil"]);
  });

  it("defines the rest phoneme as unvoiced silence", () => {
    const def = english.phonemes.get("sil");
    expect(def?.type).toBe("silence");
    expect(def?.voiced).toBe(false);
  });

  it("keeps the rhotic approximant distinct from the rest phoneme", () => {
    const r = english.phonemes.get("R");
    expect(r?.type).toBe("consonant");
    expect(r?.voiced).toBe(true);
  });

  it("sings lowercase r as the approximant", () => {
    const result = english.lyricToPhonemes("r");
    expect(result).not.toEqual(["sil"]);
    expect(result).toContain("R");
  });
});

describe("english CMU dictionary integrity", () => {
  const g2p = g2pData as Record<string, string[]>;

  it("emits only phonemes the table defines", () => {
    const missing = new Set<string>();
    for (const symbols of Object.values(g2p)) {
      for (const s of symbols) {
        if (!english.phonemes.has(s)) missing.add(s);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("preserves the rhotic in words that contain it", () => {
    for (const word of ["car", "star", "more", "for", "far", "your"]) {
      expect(g2p[word]).toContain("R");
    }
  });

  it("preserves the sibilant in words that contain it", () => {
    for (const word of ["see", "best", "class", "sister"]) {
      expect(g2p[word]).toContain("S");
    }
  });

  it("keeps the affricate intact", () => {
    expect(g2p["cash"]).toContain("SH");
    expect(g2p["john"]).toContain("JH");
  });

  it("does not leak stress markers", () => {
    for (const [word, symbols] of Object.entries(g2p)) {
      for (const s of symbols) {
        expect(s).toMatch(/^[A-Z]+$/);
      }
      if (word === "hello") expect(symbols.join(" ")).toBe("HH AH L OW");
    }
  });
});
