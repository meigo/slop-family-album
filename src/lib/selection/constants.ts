/**
 * v1 selection weights + targets. Hardcoded for Phase 3a. Phase 3c (or
 * sooner if needed) can lift these into a TOML config or UI sliders.
 */

export const SCORE_WEIGHTS = {
  // Positive contributors
  sharpness: 1.0,        // blur (Laplacian variance) normalized to 0-1
  exposure: 0.5,         // exposure score 0-1
  faces_count: 0.3,      // diminishing — capped at 4 faces
  faces_quality: 1.5,    // mean per-face quality
  pinned_person: 1.0,    // bonus per pinned person present in this photo
  // Negative contributors (subtracted)
  duplicate_member: 1.5,    // non-representative member of a duplicate group
  screenshot: 5.0,          // hard penalty if scene-tag 'screenshot' > 0.5
  document: 5.0,            // hard penalty if scene-tag 'document' > 0.5
};

export const ALBUM_DEFAULTS = {
  // Per-day cap: at most this many photos per day taken (a day-bucket).
  // Soft — over-budget days drop lowest-scoring beyond this cap.
  per_day_cap: 3,
};

export const CALENDAR_DEFAULTS = {
  // How many photos to put in each calendar month.
  photos_per_month: 1,
  // 'seasonal-memory' is the only mode in 3a. 'best-of' is deferred.
  mode: 'seasonal-memory' as const,
};

/**
 * Sharpness normalization: raw Laplacian variance on a typical phone
 * photo lands in the 50-3000 range. We clamp to [0, 1] using a soft
 * saturation around the "definitely sharp" cutoff so the additive score
 * isn't dominated by an extreme outlier.
 */
export function normalizedSharpness(blur: number | null): number {
  if (blur === null || blur <= 0) return 0;
  // 100 = passable, 500 = sharp, 1500+ = very sharp (saturates).
  return Math.min(1.0, blur / 500);
}
