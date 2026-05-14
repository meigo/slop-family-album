import Database from '@tauri-apps/plugin-sql';
import type { ProjectRow, PhotoRow, PhotoInsert } from './types';

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
