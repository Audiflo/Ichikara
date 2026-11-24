import { convert, createRegistry, detectNotation, IPA, VOCALOID_SAMPA } from "../src/index";

describe("registry", () => {
  it("detects the notation of unambiguous phoneme sequences", () => {
    expect(detectNotation("kh Q O:")).toBe(VOCALOID_SAMPA);
    expect(detectNotation("HH AH L OW")).toBe("arpabet");
    expect(detectNotation("k ɑ aɪ")).toBe(IPA);
  });

  it("supports notation adapters supplied by consumers", () => {
    const registry = createRegistry().extend({
      id: "example",
      toIpa: { zz: ["z"] },
      fromIpa: { z: "zz" },
    });

    expect(convert("zz", { from: "example", to: "arpabet", registry })).toEqual(["Z"]);
    expect(convert("Z", { from: "arpabet", to: "example", registry })).toEqual(["zz"]);
  });

  it("keeps the default registry immutable when extended", () => {
    createRegistry().extend({
      id: "ephemeral",
      toIpa: { zz: ["z"] },
      fromIpa: { z: "zz" },
    });

    expect(() => convert("zz", { from: "ephemeral", to: "arpabet" })).toThrow();
  });
});
