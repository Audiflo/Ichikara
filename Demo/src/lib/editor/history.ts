import { Undora } from "undora";

const HISTORY_CAPACITY = 100;

/** Isolated document snapshots. Callers supply plain data, not reactive proxies. */
export class EditorHistory<T> {
  private readonly history = new Undora<T>({ capacity: HISTORY_CAPACITY, clone: (value) => structuredClone(value) });

  /** Start a document history with an owned copy of initial data. */
  constructor(initial: T) {
    this.reset(initial);
  }

  /** Whether an older document state is available. */
  get canUndo(): boolean {
    return this.history.canUndo();
  }

  /** Whether an undone document state is available. */
  get canRedo(): boolean {
    return this.history.canRedo();
  }

  /** Record a complete transaction; a new edit discards the redo branch. */
  push(value: T): void {
    this.history.pushState(value, { silent: true });
  }

  private current(): T {
    const value = this.history.getCurrent();
    if (value === undefined) throw new Error("Document history must retain its initial state");
    return structuredClone(value);
  }

  /** Restore an editable copy of the previous state, or the initial state at the boundary. */
  undo(): T {
    this.history.undo();
    return this.current();
  }

  /** Restore an editable copy of the next state, or the current state at the boundary. */
  redo(): T {
    this.history.redo();
    return this.current();
  }

  /** Replace the document and discard all earlier undo/redo entries. */
  reset(value: T): void {
    this.history.clear();
    this.push(value);
  }
}
