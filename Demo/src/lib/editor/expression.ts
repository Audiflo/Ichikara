/** Per-note controls supported by the expression editor. */
export type Expression = "intensity" | "velocity";

/** Names, limits, and defaults shared by bar painting and numeric editing. */
export const expressions: readonly { key: Expression; name: string; maximum: number; fallback: number; unit: string }[] = [
  { key: "intensity", name: "Intensity", maximum: 200, fallback: 100, unit: "%" },
  { key: "velocity", name: "Velocity", maximum: 127, fallback: 100, unit: "/ 127" },
];

/** Map a top-origin pointer coordinate to a rounded expression value.
 * Captured pointers outside the lane clamp to its limits; an unmeasured lane returns zero.
 */
export function expressionValueAt(y: number, height: number, maximum: number): number {
  if (height <= 0) return 0;
  return Math.round(Math.max(0, Math.min(maximum, (1 - y / height) * maximum)));
}
