/** Read an allocated element, throwing RangeError for a missing or invalid index. */
export function elementAt<T>(values: ArrayLike<T>, index: number): T {
  const value = values[index];
  if (!Number.isInteger(index) || index < 0 || index >= values.length || value === undefined) {
    throw new RangeError(`Missing element at index ${index} (length ${values.length})`);
  }
  return value;
}

/** Require a finite numeric value within inclusive bounds; throw RangeError otherwise. */
export function finiteInRange(value: number, name: string, min: number, max = Number.MAX_VALUE): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}`);
  }
  return value;
}

/** Require a safe integer within inclusive bounds; throw RangeError otherwise. */
export function integerInRange(value: number, name: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  finiteInRange(value, name, min, max);
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
  return value;
}
