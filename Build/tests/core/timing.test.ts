import { TempoMap } from "../../src/core/timing";

describe("TempoMap", () => {
  const map = () =>
    new TempoMap(
      [
        { tick: 0, tempo: 120 },
        { tick: 480, tempo: 60 },
        { tick: 960, tempo: 240 },
      ],
      480,
    );

  it.each([
    [0, 0],
    [240, 0.25],
    [480, 0.5],
    [720, 1],
    [960, 1.5],
    [1440, 1.75],
  ])("maps tick %s to %s seconds and back across tempo boundaries", (tick, seconds) => {
    expect(map().secondsAt(tick)).toBeCloseTo(seconds, 10);
    expect(map().tickAt(seconds)).toBeCloseTo(tick, 10);
  });

  it("owns an immutable, sorted tempo snapshot", () => {
    const events = [
      { tick: 480, tempo: 60 },
      { tick: 0, tempo: 120 },
    ];
    const timing = new TempoMap(events, 480);
    events[0] = { tick: 480, tempo: 240 };
    expect(timing.secondsAt(960)).toBe(1.5);
  });

  it("uses 120 BPM before the first supplied event", () => {
    expect(new TempoMap([{ tick: 480, tempo: 60 }], 480).secondsAt(960)).toBe(1.5);
  });

  it.each([0, -1, 0.5, Infinity])("rejects invalid resolution %s", (resolution) => {
    expect(() => new TempoMap([], resolution)).toThrow(RangeError);
  });

  it("rejects conflicting tempo events and invalid timeline coordinates", () => {
    expect(
      () =>
        new TempoMap(
          [
            { tick: 0, tempo: 120 },
            { tick: 0, tempo: 60 },
          ],
          480,
        ),
    ).toThrow(/duplicate/i);
    expect(() => new TempoMap([{ tick: 0, tempo: 0 }], 480)).toThrow(RangeError);
    expect(() => map().secondsAt(-1)).toThrow(RangeError);
    expect(() => map().tickAt(NaN)).toThrow(RangeError);
  });
});
