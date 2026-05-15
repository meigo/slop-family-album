import type { CvScoreRow, FaceRow, PhotoTagRow } from '$lib/db/types';
import { SCORE_WEIGHTS, normalizedSharpness } from './constants';

/**
 * Aggregate per-photo score. Inputs:
 *  - cv: cv_score row (blur, exposure, faces_count, faces_json — phash unused here)
 *  - facesForPhoto: face rows for this photo (gives face.quality + cluster_id)
 *  - pinnedClusterIds: set of person_cluster.id with is_pinned = 1
 *  - tagsForPhoto: photo_tag rows for this photo
 *  - isDuplicateNonRep: true if this photo is in a duplicate_group AND is NOT the representative
 *
 * Returns a real number. Higher = better. Negative values are possible
 * (heavy penalties from screenshot/document tags).
 *
 * Bias: the formula is additive + bounded per component, which makes
 * tuning straightforward but can produce ties. Selection algorithms
 * tiebreak by photo.id ascending to stay deterministic.
 */
export function aggregateScore(args: {
  cv: CvScoreRow | undefined;
  facesForPhoto: FaceRow[];
  pinnedClusterIds: Set<number>;
  tagsForPhoto: PhotoTagRow[];
  isDuplicateNonRep: boolean;
}): number {
  let s = 0;

  // ---- Positive contributors ----
  if (args.cv) {
    s += SCORE_WEIGHTS.sharpness * normalizedSharpness(args.cv.blur);
    s += SCORE_WEIGHTS.exposure * (args.cv.exposure ?? 0.5);
    s += SCORE_WEIGHTS.faces_count * Math.min(4, args.cv.faces_count ?? 0);
  }

  // Face quality: mean over faces in this photo. Skip if none.
  if (args.facesForPhoto.length > 0) {
    let q = 0;
    for (const f of args.facesForPhoto) q += f.quality ?? 0;
    s += SCORE_WEIGHTS.faces_quality * (q / args.facesForPhoto.length);
  }

  // Pinned-person bonus: +weight per distinct pinned cluster present.
  const pinnedClustersPresent = new Set<number>();
  for (const f of args.facesForPhoto) {
    if (f.cluster_id !== null && args.pinnedClusterIds.has(f.cluster_id)) {
      pinnedClustersPresent.add(f.cluster_id);
    }
  }
  s += SCORE_WEIGHTS.pinned_person * pinnedClustersPresent.size;

  // ---- Penalties ----
  if (args.isDuplicateNonRep) {
    s -= SCORE_WEIGHTS.duplicate_member;
  }
  for (const t of args.tagsForPhoto) {
    if (t.tag === 'screenshot' && t.score > 0.5) s -= SCORE_WEIGHTS.screenshot;
    if (t.tag === 'document' && t.score > 0.5) s -= SCORE_WEIGHTS.document;
  }

  return s;
}
