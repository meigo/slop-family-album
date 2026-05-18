/** Convert a project's page_size_w_mm × page_size_h_mm into:
 *   - a CSS @page size string for the PDF export
 *   - the numeric aspect ratio for on-screen preview
 *
 * Pure function — no defaults are applied here. Callers should pass the
 * project's stored width/height (the DB schema has NOT NULL DEFAULT 297/210
 * so values are always present after migration 016).
 */
export function paperForSize(width_mm: number, height_mm: number): {
  cssSize: string;
  aspect: number;
} {
  return {
    cssSize: `${width_mm}mm ${height_mm}mm`,
    aspect: width_mm / height_mm,
  };
}
