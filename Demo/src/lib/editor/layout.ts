/** Minimum editing areas and divider thickness in CSS pixels. */
export const workspaceSize = {
  divider: 6,
  arrangement: 170,
  part: 260,
  piano: 80,
  editorWidth: 280,
};

/** Fit a preferred pixel size to a measured container while reserving sibling space.
 * Inputs are finite CSS pixel sizes with 0 <= minimum <= maximum.
 * An unmeasured or undersized container retains the minimum; its owner must allow scrolling.
 * Returns the rendered value and the effective bounds for pointer and keyboard resizing.
 */
export function constrainPane(
  preferred: number,
  available: number,
  minimum: number,
  maximum: number,
  reserved: number,
): {
  min: number;
  max: number;
  value: number;
} {
  const max = Math.max(minimum, Math.min(maximum, available - reserved));
  return { min: minimum, max, value: Math.max(minimum, Math.min(max, preferred)) };
}
