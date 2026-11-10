import type { ProjectNote } from "ichikara";

/** A note's source position and time interval in an immutable render snapshot. */
export interface IndexedNote {
  readonly index: number;
  readonly note: Readonly<ProjectNote>;
  readonly end: number;
}

/** Tick-sorted notes with prefix end bounds for overlapping-note viewport queries. */
export interface NoteIndex {
  readonly entries: readonly IndexedNote[];
  readonly ends: readonly number[];
}

/** Index a validated note snapshot without sorting or modifying the source array. */
export function createNoteIndex(notes: readonly ProjectNote[]): NoteIndex {
  const entries = notes.map((note, index) => ({ note, index, end: note.tick + note.length })).sort((a, b) => a.note.tick - b.note.tick);
  let end = 0;
  const ends = entries.map((entry) => (end = Math.max(end, entry.end)));
  return { entries, ends };
}

/** Return notes intersecting the inclusive tick range, including earlier sustaining notes. */
export function visibleNotes(index: NoteIndex, start: number, end: number): IndexedNote[] {
  let low = 0;
  let high = index.entries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((index.ends[middle] ?? Infinity) < start) low = middle + 1;
    else high = middle;
  }
  const result: IndexedNote[] = [];
  for (let i = low; i < index.entries.length; i++) {
    const entry = index.entries[i];
    if (!entry || entry.note.tick > end) break;
    if (entry.end >= start) result.push(entry);
  }
  return result;
}
