import { MeterMap } from "../../src/project/meter";

describe("meter map", () => {
  it("labels beats across 4/4 and 6/8 changes without assuming quarter-note beats", () => {
    const map = new MeterMap(
      [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 1920, numerator: 6, denominator: 8 },
      ],
      480,
    );
    expect(map.positionAt(2160)).toEqual({ bar: 2, beat: 2, tickInBeat: 0 });
    expect(map.positionAt(3360)).toEqual({ bar: 3, beat: 1, tickInBeat: 0 });
    expect(map.grid(1800, 2400)).toEqual([
      { tick: 1920, bar: 2, beat: 1 },
      { tick: 2160, bar: 2, beat: 2 },
      { tick: 2400, bar: 2, beat: 3 },
    ]);
  });

  it("starts a new bar for a mid-bar meter change", () => {
    const map = new MeterMap(
      [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 960, numerator: 3, denominator: 4 },
      ],
      480,
    );
    expect(map.positionAt(960)).toEqual({ bar: 2, beat: 1, tickInBeat: 0 });
    expect(map.tickAtBar(3)).toBe(2400);
  });

  it("rejects invalid meters, duplicate ticks, and invalid bar numbers", () => {
    expect(() => new MeterMap([{ tick: 0, numerator: 4, denominator: 3 }], 480)).toThrow();
    expect(
      () =>
        new MeterMap(
          [
            { tick: 0, numerator: 4, denominator: 4 },
            { tick: 0, numerator: 3, denominator: 4 },
          ],
          480,
        ),
    ).toThrow();
    expect(() => new MeterMap([], 480).tickAtBar(0)).toThrow();
  });
});
