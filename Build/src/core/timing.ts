import type { TempoEvent } from "./types";
import { elementAt, finiteInRange, integerInRange } from "./validation";

const DEFAULT_TEMPO = 120;
const SECONDS_PER_MINUTE = 60;

interface Segment extends TempoEvent {
  seconds: number;
  secondsPerTick: number;
}

/** Piecewise musical time conversion. */
export class TempoMap {
  private readonly segments: Segment[];

  /** Build a sorted tempo map at the supplied ticks-per-quarter resolution.
   * Missing initial tempo defaults to 120 BPM. Invalid or duplicate events throw RangeError.
   */
  constructor(events: readonly TempoEvent[], resolution: number) {
    integerInRange(resolution, "resolution", 1);
    const sorted = events.map((event) => ({ ...event })).sort((a, b) => a.tick - b.tick);
    if (sorted[0]?.tick !== 0) sorted.unshift({ tick: 0, tempo: DEFAULT_TEMPO });
    this.segments = [];
    for (const event of sorted) {
      integerInRange(event.tick, "tempo tick", 0);
      finiteInRange(event.tempo, "tempo", Number.MIN_VALUE);
      const previous = this.segments.at(-1);
      if (previous?.tick === event.tick) throw new RangeError("Duplicate tempo tick");
      const seconds = previous ? previous.seconds + (event.tick - previous.tick) * previous.secondsPerTick : 0;
      const secondsPerTick = SECONDS_PER_MINUTE / event.tempo / resolution;
      finiteInRange(secondsPerTick, "seconds per tick", Number.MIN_VALUE);
      finiteInRange(seconds, "tempo time", 0);
      this.segments.push({ ...event, seconds, secondsPerTick });
    }
  }

  private segmentAt(value: number, key: "tick" | "seconds"): Segment {
    let low = 0;
    let high = this.segments.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (elementAt(this.segments, middle)[key] <= value) low = middle;
      else high = middle - 1;
    }
    return elementAt(this.segments, low);
  }

  /** Convert a nonnegative tick, including fractional ticks, to seconds. Throws on invalid time. */
  secondsAt(tick: number): number {
    finiteInRange(tick, "tick", 0, Number.MAX_SAFE_INTEGER);
    const segment = this.segmentAt(tick, "tick");
    return finiteInRange(segment.seconds + (tick - segment.tick) * segment.secondsPerTick, "time", 0);
  }

  /** Convert nonnegative seconds to fractional ticks. Throws on invalid or unrepresentable time. */
  tickAt(seconds: number): number {
    finiteInRange(seconds, "seconds", 0);
    const segment = this.segmentAt(seconds, "seconds");
    return finiteInRange(segment.tick + (seconds - segment.seconds) / segment.secondsPerTick, "tick", 0, Number.MAX_SAFE_INTEGER);
  }

  /** Return BPM at a nonnegative tick; throws on invalid coordinates. */
  tempoAt(tick: number): number {
    finiteInRange(tick, "tick", 0, Number.MAX_SAFE_INTEGER);
    return this.segmentAt(tick, "tick").tempo;
  }
}
