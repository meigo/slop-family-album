import Database from '@tauri-apps/plugin-sql';
import type {
  ProjectRow, PhotoRow, PhotoInsert, CvScoreRow, CvScoreInsert,
  FaceRow, FaceInsert, PersonClusterRow,
  SelectionRow, SelectedPhotoRow, SelectedPhotoInsert,
} from './types';

let _db: Database | null = null;

export async function db(): Promise<Database> {
  if (!_db) _db = await Database.load('sqlite:app.sqlite');
  return _db;
}

export async function createProject(args: {
  name: string;
  source_dir: string;
  album_year: number;
}): Promise<number> {
  const d = await db();
  const now = Date.now();
  const result = await d.execute(
    'INSERT INTO project (name, source_dir, album_year, calendar_year, created_at) VALUES (?, ?, ?, ?, ?)',
    [args.name, args.source_dir, args.album_year, args.album_year + 1, now]
  );
  return result.lastInsertId as number;
}

export async function listProjects(): Promise<ProjectRow[]> {
  const d = await db();
  return d.select<ProjectRow[]>('SELECT * FROM project ORDER BY created_at DESC');
}

export async function getProject(id: number): Promise<ProjectRow | null> {
  const d = await db();
  const rows = await d.select<ProjectRow[]>('SELECT * FROM project WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function upsertPhoto(p: PhotoInsert): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO photo (project_id, path, sha256, taken_at, width, height, orientation, exif_json, thumb_path, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (project_id, sha256) DO UPDATE SET
       path = excluded.path,
       taken_at = excluded.taken_at,
       width = excluded.width,
       height = excluded.height,
       orientation = excluded.orientation,
       exif_json = excluded.exif_json,
       thumb_path = excluded.thumb_path,
       indexed_at = excluded.indexed_at`,
    [p.project_id, p.path, p.sha256, p.taken_at, p.width, p.height, p.orientation, p.exif_json, p.thumb_path, p.indexed_at]
  );
}

export async function listPhotos(projectId: number): Promise<PhotoRow[]> {
  const d = await db();
  return d.select<PhotoRow[]>(
    'SELECT * FROM photo WHERE project_id = ? ORDER BY taken_at ASC, id ASC',
    [projectId]
  );
}

export async function countPhotos(projectId: number): Promise<number> {
  const d = await db();
  const rows = await d.select<{ n: number }[]>(
    'SELECT COUNT(*) as n FROM photo WHERE project_id = ?',
    [projectId]
  );
  return rows[0]?.n ?? 0;
}

// Used by the indexer to skip files that haven't changed on disk since the
// last index pass. Returns a map of source path → indexed_at (ms epoch).
export async function listIndexedAtByPath(projectId: number): Promise<Map<string, number>> {
  const d = await db();
  const rows = await d.select<{ path: string; indexed_at: number }[]>(
    'SELECT path, indexed_at FROM photo WHERE project_id = ?',
    [projectId]
  );
  return new Map(rows.map((r) => [r.path, r.indexed_at]));
}

export async function upsertCvScore(s: CvScoreInsert): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO cv_score (photo_id, blur, faces_count, faces_json, phash, computed_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (photo_id) DO UPDATE SET
       blur = excluded.blur,
       faces_count = excluded.faces_count,
       faces_json = excluded.faces_json,
       phash = excluded.phash,
       computed_at = excluded.computed_at`,
    [s.photo_id, s.blur, s.faces_count, s.faces_json, s.phash, s.computed_at]
  );
}

export async function getCvScore(photoId: number): Promise<CvScoreRow | null> {
  const d = await db();
  const rows = await d.select<CvScoreRow[]>(
    'SELECT * FROM cv_score WHERE photo_id = ?', [photoId]
  );
  return rows[0] ?? null;
}

export async function listCvScoresByProject(projectId: number): Promise<Array<CvScoreRow & { path: string }>> {
  const d = await db();
  return d.select<Array<CvScoreRow & { path: string }>>(
    `SELECT cv_score.*, photo.path
     FROM cv_score
     INNER JOIN photo ON photo.id = cv_score.photo_id
     WHERE photo.project_id = ?`,
    [projectId]
  );
}

// Used by the scanner to skip CV work on photos already CV-scored after
// they were last indexed.
export async function listCvComputedAtByPhotoId(projectId: number): Promise<Map<number, number>> {
  const d = await db();
  const rows = await d.select<{ photo_id: number; computed_at: number }[]>(
    `SELECT cv_score.photo_id, cv_score.computed_at
     FROM cv_score
     INNER JOIN photo ON photo.id = cv_score.photo_id
     WHERE photo.project_id = ?`,
    [projectId]
  );
  return new Map(rows.map((r) => [r.photo_id, r.computed_at]));
}

export async function clearDuplicateGroups(projectId: number): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM duplicate_group WHERE project_id = ?', [projectId]);
}

export async function clearCvScores(projectId: number): Promise<void> {
  const d = await db();
  await d.execute(
    `DELETE FROM cv_score
     WHERE photo_id IN (SELECT id FROM photo WHERE project_id = ?)`,
    [projectId]
  );
}

export async function insertDuplicateGroup(args: {
  project_id: number;
  representative_photo_id: number;
  member_photo_ids: number[];
}): Promise<number> {
  const d = await db();
  const now = Date.now();
  const res = await d.execute(
    'INSERT INTO duplicate_group (project_id, representative_photo_id, created_at) VALUES (?, ?, ?)',
    [args.project_id, args.representative_photo_id, now]
  );
  const gid = res.lastInsertId as number;
  for (const pid of args.member_photo_ids) {
    await d.execute(
      'INSERT INTO duplicate_group_member (group_id, photo_id) VALUES (?, ?)',
      [gid, pid]
    );
  }
  return gid;
}

export async function listDuplicateMembersByPhoto(projectId: number): Promise<Map<number, number>> {
  // photo_id → group_id (which dup group, if any, each photo belongs to)
  const d = await db();
  const rows = await d.select<{ photo_id: number; group_id: number }[]>(
    `SELECT duplicate_group_member.photo_id, duplicate_group_member.group_id
     FROM duplicate_group_member
     INNER JOIN duplicate_group ON duplicate_group.id = duplicate_group_member.group_id
     WHERE duplicate_group.project_id = ?`,
    [projectId]
  );
  return new Map(rows.map((r) => [r.photo_id, r.group_id]));
}

export async function upsertImageEmbedding(args: {
  photo_id: number;
  model: string;
  vector: string;          // base64-encoded float32 little-endian
  computed_at: number;
}): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO image_embedding (photo_id, model, vector, computed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (photo_id) DO UPDATE SET
       model = excluded.model,
       vector = excluded.vector,
       computed_at = excluded.computed_at`,
    [args.photo_id, args.model, args.vector, args.computed_at]
  );
}

export async function listImageEmbeddingsComputedAt(projectId: number): Promise<Map<number, number>> {
  const d = await db();
  const rows = await d.select<{ photo_id: number; computed_at: number }[]>(
    `SELECT image_embedding.photo_id, image_embedding.computed_at
     FROM image_embedding
     INNER JOIN photo ON photo.id = image_embedding.photo_id
     WHERE photo.project_id = ?`,
    [projectId]
  );
  return new Map(rows.map((r) => [r.photo_id, r.computed_at]));
}

export async function replacePhotoTags(photoId: number, tags: Array<{ tag: string; score: number }>): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM photo_tag WHERE photo_id = ?', [photoId]);
  for (const t of tags) {
    await d.execute(
      'INSERT INTO photo_tag (photo_id, tag, score) VALUES (?, ?, ?)',
      [photoId, t.tag, t.score]
    );
  }
}

export async function listTopTagByPhoto(projectId: number): Promise<Map<number, { tag: string; score: number }>> {
  const d = await db();
  const rows = await d.select<{ photo_id: number; tag: string; score: number }[]>(
    `SELECT pt.photo_id, pt.tag, pt.score
     FROM photo_tag pt
     INNER JOIN photo p ON p.id = pt.photo_id
     WHERE p.project_id = ?
       AND pt.score = (
         SELECT MAX(score) FROM photo_tag WHERE photo_id = pt.photo_id
       )`,
    [projectId]
  );
  return new Map(rows.map((r) => [r.photo_id, { tag: r.tag, score: r.score }]));
}

export async function clearFacesForPhoto(photoId: number): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM face WHERE photo_id = ?', [photoId]);
}

export async function insertFace(f: FaceInsert): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `INSERT INTO face (photo_id, bbox_x, bbox_y, bbox_w, bbox_h, embedding, quality, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [f.photo_id, f.bbox_x, f.bbox_y, f.bbox_w, f.bbox_h, f.embedding, f.quality, f.computed_at]
  );
  return r.lastInsertId as number;
}

export async function listFacesByProject(projectId: number): Promise<FaceRow[]> {
  const d = await db();
  return d.select<FaceRow[]>(
    `SELECT face.*
     FROM face
     INNER JOIN photo ON photo.id = face.photo_id
     WHERE photo.project_id = ?
     ORDER BY face.id ASC`,
    [projectId]
  );
}

export async function setFaceCluster(faceId: number, clusterId: number | null): Promise<void> {
  const d = await db();
  await d.execute('UPDATE face SET cluster_id = ? WHERE id = ?', [clusterId, faceId]);
}

export async function clearPersonClusters(projectId: number): Promise<void> {
  const d = await db();
  // ON DELETE SET NULL on face.cluster_id keeps face rows; clusters disappear.
  await d.execute('DELETE FROM person_cluster WHERE project_id = ?', [projectId]);
}

export async function insertPersonCluster(projectId: number): Promise<number> {
  const d = await db();
  const r = await d.execute(
    'INSERT INTO person_cluster (project_id, name, is_pinned, created_at) VALUES (?, NULL, 0, ?)',
    [projectId, Date.now()]
  );
  return r.lastInsertId as number;
}

export async function listPersonClusters(projectId: number): Promise<PersonClusterRow[]> {
  const d = await db();
  return d.select<PersonClusterRow[]>(
    'SELECT * FROM person_cluster WHERE project_id = ? ORDER BY created_at ASC',
    [projectId]
  );
}

export async function updatePersonCluster(id: number, args: { name?: string | null; is_pinned?: boolean }): Promise<void> {
  const d = await db();
  if (args.name !== undefined) {
    await d.execute('UPDATE person_cluster SET name = ? WHERE id = ?', [args.name, id]);
  }
  if (args.is_pinned !== undefined) {
    await d.execute(
      'UPDATE person_cluster SET is_pinned = ? WHERE id = ?',
      [args.is_pinned ? 1 : 0, id]
    );
  }
}

export async function deletePhotoByPath(projectId: number, path: string): Promise<void> {
  const d = await db();
  await d.execute(
    'DELETE FROM photo WHERE project_id = ? AND path = ?',
    [projectId, path]
  );
}

export async function deletePersonCluster(id: number): Promise<void> {
  const d = await db();
  // ON DELETE SET NULL on face.cluster_id nullifies references.
  await d.execute('DELETE FROM person_cluster WHERE id = ?', [id]);
}

export async function resetFaceClustersForProject(projectId: number): Promise<void> {
  const d = await db();
  await d.execute(
    `UPDATE face SET cluster_id = NULL
     WHERE photo_id IN (SELECT id FROM photo WHERE project_id = ?)`,
    [projectId]
  );
}

// Mark all existing selections for this (project, kind) as no-longer-current,
// then insert a new one. Returns the new selection_id.
export async function startSelection(projectId: number, kind: 'album' | 'calendar'): Promise<number> {
  const d = await db();
  await d.execute(
    'UPDATE selection SET is_current = 0 WHERE project_id = ? AND kind = ?',
    [projectId, kind]
  );
  const result = await d.execute(
    'INSERT INTO selection (project_id, kind, generated_at, is_current) VALUES (?, ?, ?, 1)',
    [projectId, kind, Date.now()]
  );
  return result.lastInsertId as number;
}

export async function insertSelectedPhoto(args: SelectedPhotoInsert): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO selected_photo (selection_id, photo_id, bucket_key, rank, score, user_state)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      args.selection_id, args.photo_id, args.bucket_key, args.rank,
      args.score, args.user_state ?? 'auto',
    ]
  );
}

export async function getCurrentSelection(projectId: number, kind: 'album' | 'calendar'): Promise<SelectionRow | null> {
  const d = await db();
  const rows = await d.select<SelectionRow[]>(
    'SELECT * FROM selection WHERE project_id = ? AND kind = ? AND is_current = 1 LIMIT 1',
    [projectId, kind]
  );
  return rows[0] ?? null;
}

// Returns selected photos for a selection, ordered by bucket_key (chronological
// for album, calendar) then rank within bucket. Joins photo for path + thumb.
export async function listSelectedPhotos(selectionId: number): Promise<Array<SelectedPhotoRow & { path: string; thumb_path: string | null; taken_at: number | null }>> {
  const d = await db();
  return d.select<Array<SelectedPhotoRow & { path: string; thumb_path: string | null; taken_at: number | null }>>(
    `SELECT sp.*, p.path, p.thumb_path, p.taken_at
     FROM selected_photo sp
     INNER JOIN photo p ON p.id = sp.photo_id
     WHERE sp.selection_id = ?
     ORDER BY sp.bucket_key ASC, sp.rank ASC`,
    [selectionId]
  );
}
