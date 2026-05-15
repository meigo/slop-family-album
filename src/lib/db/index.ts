import Database from '@tauri-apps/plugin-sql';
import type { ProjectRow, PhotoRow, PhotoInsert, CvScoreRow, CvScoreInsert } from './types';

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
