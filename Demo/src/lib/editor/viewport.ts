/** Follow a playhead in content pixels, clamped to the scrollable extent.
 * Page mode moves only at viewport edges; smooth mode anchors the playhead one third across.
 */
export function followPosition(position: number, scroll: number, viewport: number, content: number, mode: "page" | "smooth"): number {
  if (viewport <= 0) return 0;
  const maximum = Math.max(0, content - viewport);
  const margin = viewport * 0.1;
  const target =
    mode === "smooth" ? position - viewport / 3 : position < scroll || position > scroll + viewport - margin ? position - margin : scroll;
  return Math.max(0, Math.min(maximum, target));
}
