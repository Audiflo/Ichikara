import { elementAt, finiteInRange, integerInRange } from "../core/validation";
import type { MeterEvent } from "./types";

/** One-based musical location with fractional ticks inside a beat. */
export interface MusicalPosition {
  bar: number;
  beat: number;
  tickInBeat: number;
}

/** Absolute beat line for a timeline ruler. */
export interface BeatLine {
  tick: number;
  bar: number;
  beat: number;
}

interface Segment extends MeterEvent {
  bar: number;
  beatTicks: number;
  barTicks: number;
}

/** Immutable meter map. A meter change starts a new bar, including changes inside a prior bar. */
export class MeterMap {
  private readonly segments: Segment[] = [];

  /** Build a sorted meter snapshot; default to 4/4 and reject invalid or duplicate events. */
  constructor(events: readonly MeterEvent[], resolution: number) {
    integerInRange(resolution, "resolution", 1);
    const sorted = events.map((event) => ({ ...event })).sort((a, b) => a.tick - b.tick);
    if (sorted[0]?.tick !== 0) sorted.unshift({ tick: 0, numerator: 4, denominator: 4 });
    for (const event of sorted) {
      integerInRange(event.tick, "meter tick", 0);
      integerInRange(event.numerator, "meter numerator", 1, 64);
      integerInRange(event.denominator, "meter denominator", 1, 64);
      if (!Number.isInteger(Math.log2(event.denominator))) throw new RangeError("Meter denominator must be a power of two");
      const previous = this.segments.at(-1);
      if (previous?.tick === event.tick) throw new RangeError("Duplicate meter tick");
      const bar = previous ? previous.bar + Math.ceil((event.tick - previous.tick) / previous.barTicks) : 1;
      const beatTicks = (resolution * 4) / event.denominator;
      this.segments.push({ ...event, bar, beatTicks, barTicks: beatTicks * event.numerator });
    }
  }

  private segmentAt(value: number, field: "tick" | "bar"): Segment {
    let low = 0;
    let high = this.segments.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (elementAt(this.segments, middle)[field] <= value) low = middle;
      else high = middle - 1;
    }
    return elementAt(this.segments, low);
  }

  /** Convert a nonnegative tick to a one-based bar and beat; invalid coordinates throw. */
  positionAt(tick: number): MusicalPosition {
    finiteInRange(tick, "tick", 0, Number.MAX_SAFE_INTEGER);
    const segment = this.segmentAt(tick, "tick");
    const elapsed = tick - segment.tick;
    const beats = Math.floor(elapsed / segment.beatTicks);
    return {
      bar: segment.bar + Math.floor(beats / segment.numerator),
      beat: (beats % segment.numerator) + 1,
      tickInBeat: elapsed % segment.beatTicks,
    };
  }

  /** Return the absolute start tick of a one-based bar; invalid or unrepresentable positions throw. */
  tickAtBar(bar: number): number {
    integerInRange(bar, "bar", 1);
    const segment = this.segmentAt(bar, "bar");
    return finiteInRange(segment.tick + (bar - segment.bar) * segment.barTicks, "bar tick", 0, Number.MAX_SAFE_INTEGER);
  }

  /** Enumerate beat lines in an inclusive viewport range; reversed or oversized ranges throw. */
  grid(start: number, end: number): BeatLine[] {
    finiteInRange(start, "grid start", 0, Number.MAX_SAFE_INTEGER);
    finiteInRange(end, "grid end", start, Number.MAX_SAFE_INTEGER);
    const lines: BeatLine[] = [];
    const maximumLines = 10000;
    for (const [index, segment] of this.segments.entries()) {
      const limit = Math.min(end, this.segments[index + 1]?.tick ?? Infinity);
      let tick = segment.tick + Math.max(0, Math.ceil((start - segment.tick) / segment.beatTicks)) * segment.beatTicks;
      for (; tick <= limit; tick += segment.beatTicks) {
        if (tick === this.segments[index + 1]?.tick) break;
        if (lines.length >= maximumLines) throw new RangeError("Meter grid exceeds viewport capacity");
        const { bar, beat } = this.positionAt(tick);
        lines.push({ tick, bar, beat });
      }
    }
    return lines;
  }
}
