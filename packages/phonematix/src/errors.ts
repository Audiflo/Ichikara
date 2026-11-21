import type { NotationId } from "./types";

/** Raised when an input symbol is not present in a notation's conversion table. */
export class UnknownPhonemeError extends Error {
  readonly notation: NotationId;
  readonly symbol: string;

  constructor(notation: NotationId, symbol: string) {
    super(`Unknown ${notation} phoneme: ${symbol}`);
    this.name = "UnknownPhonemeError";
    this.notation = notation;
    this.symbol = symbol;
  }
}

/** Raised when a conversion references a notation that is not in the registry. */
export class UnknownNotationError extends Error {
  readonly notation: NotationId;

  constructor(notation: NotationId) {
    super(`Unknown phoneme notation: ${notation}`);
    this.name = "UnknownNotationError";
    this.notation = notation;
  }
}
