import { convert, UnknownPhonemeError } from "../src/index";

describe("convert", () => {
  it("converts VOCALOID Sampa aliases through IPA to ARPAbet", () => {
    expect(convert(["kh", "Q", "O:", "aI", "tS", "{"], { from: "vocaloid-sampa", to: "arpabet" })).toEqual([
      "K",
      "AA",
      "AO",
      "AY",
      "CH",
      "AE",
    ]);
  });

  it("expands VOCALOID r-colored aliases into ARPAbet sequences", () => {
    expect(convert(["I@", "O@", "e@"], { from: "vocaloid-sampa", to: "arpabet" })).toEqual(["IH", "R", "AO", "R", "EH", "R"]);
  });

  it("normalizes lowercase ARPAbet and stress markers", () => {
    expect(convert("hh0 ah1 l ow", { from: "arpabet", to: "arpabet" })).toEqual(["HH", "AH", "L", "OW"]);
  });

  it("strips runs of trailing stress digits", () => {
    expect(convert("ah12 ow345", { from: "arpabet", to: "arpabet" })).toEqual(["AH", "OW"]);
  });

  it("converts IPA segments to VOCALOID Sampa", () => {
    expect(convert(["k", "ɑ", "aɪ"], { from: "ipa", to: "vocaloid-sampa" })).toEqual(["k", "Q", "aI"]);
  });

  it("reports the notation and symbol for unknown phonemes", () => {
    expect(() => convert(["W"], { from: "vocaloid-sampa", to: "arpabet" })).toThrow(UnknownPhonemeError);

    try {
      convert(["W"], { from: "vocaloid-sampa", to: "arpabet" });
      throw new Error("expected conversion to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownPhonemeError);
      expect(error).toMatchObject({ notation: "vocaloid-sampa", symbol: "W" });
    }
  });
});
