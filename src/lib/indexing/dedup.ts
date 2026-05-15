import {
  clearDuplicateGroups, insertDuplicateGroup, listPhotos, listCvScoresByProject,
} from '$lib/db';

const HAMMING_THRESHOLD = 6;  // 0–64 bits differ between near-duplicates

function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    // popcount on a nibble
    d += [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4][x];
  }
  return d;
}

interface PhotoWithCv {
  id: number;
  path: string;
  phash: string;
  blur: number | null;
}

/** Greedy clustering: each photo joins the first existing group whose
 *  representative is within HAMMING_THRESHOLD. Sharpest member of the
 *  group is promoted to representative when assignments settle.
 */
export async function detectDuplicates(projectId: number): Promise<void> {
  await clearDuplicateGroups(projectId);

  const photos = await listPhotos(projectId);
  const cvScores = await listCvScoresByProject(projectId);
  const cvById = new Map(cvScores.map((c) => [c.photo_id, c]));

  const withCv: PhotoWithCv[] = [];
  for (const p of photos) {
    const cv = cvById.get(p.id);
    if (!cv?.phash) continue;
    withCv.push({ id: p.id, path: p.path, phash: cv.phash, blur: cv.blur });
  }

  // Sort by descending blur so the sharpest photo is a candidate
  // representative for any group it starts.
  withCv.sort((a, b) => (b.blur ?? 0) - (a.blur ?? 0));

  type Group = { repId: number; repPhash: string; repBlur: number; memberIds: number[] };
  const groups: Group[] = [];

  for (const p of withCv) {
    let joined: Group | null = null;
    for (const g of groups) {
      if (hammingHex(p.phash, g.repPhash) <= HAMMING_THRESHOLD) {
        joined = g;
        break;
      }
    }
    if (joined) {
      joined.memberIds.push(p.id);
      // Promote sharper member to rep.
      if ((p.blur ?? 0) > joined.repBlur) {
        joined.repId = p.id;
        joined.repPhash = p.phash;
        joined.repBlur = p.blur ?? 0;
      }
    } else {
      groups.push({
        repId: p.id, repPhash: p.phash, repBlur: p.blur ?? 0, memberIds: [p.id],
      });
    }
  }

  // Persist only groups with 2+ members (single-photo "groups" are noise).
  for (const g of groups) {
    if (g.memberIds.length < 2) continue;
    await insertDuplicateGroup({
      project_id: projectId,
      representative_photo_id: g.repId,
      member_photo_ids: g.memberIds,
    });
  }
}
