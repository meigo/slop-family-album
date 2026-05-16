import Database from '@tauri-apps/plugin-sql';
import type {
  ProjectRow, PhotoRow, PhotoInsert, CvScoreRow, CvScoreInsert,
  FaceRow, FaceInsert, PersonClusterRow,
  SelectionRow, SelectedPhotoRow, SelectedPhotoInsert,
  PageRow, PageInsert, PageSlotRow, PageSlotInsert,
  CalendarEventRow,
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

export async function updateProjectSlotGap(id: number, slotGapPx: number): Promise<void> {
  const d = await db();
  const clamped = Math.max(0, Math.min(40, Math.round(slotGapPx)));
  await d.execute('UPDATE project SET slot_gap_px = ? WHERE id = ?', [clamped, id]);
}

export async function updateProjectPagePadding(id: number, pagePaddingPx: number): Promise<void> {
  const d = await db();
  const clamped = Math.max(0, Math.min(60, Math.round(pagePaddingPx)));
  await d.execute('UPDATE project SET page_padding_px = ? WHERE id = ?', [clamped, id]);
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
    `INSERT INTO selected_photo (selection_id, photo_id, bucket_key, rank, score, user_state, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      args.selection_id, args.photo_id, args.bucket_key, args.rank,
      args.score, args.user_state ?? 'auto', args.notes ?? null,
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

// ---- Pages ----

export async function insertPage(p: PageInsert): Promise<number> {
  const d = await db();
  const r = await d.execute(
    'INSERT INTO page (selection_id, index_in_book, template_id, title, body) VALUES (?, ?, ?, ?, ?)',
    [p.selection_id, p.index_in_book, p.template_id, p.title ?? null, p.body ?? null]
  );
  return r.lastInsertId as number;
}

export async function insertPageSlot(s: PageSlotInsert): Promise<void> {
  const d = await db();
  await d.execute(
    'INSERT INTO page_slot (page_id, slot_index, photo_id, transform_json) VALUES (?, ?, ?, ?)',
    [s.page_id, s.slot_index, s.photo_id, s.transform_json ?? null]
  );
}

export async function updateSlotPhoto(pageId: number, slotIndex: number, photoId: number): Promise<void> {
  const d = await db();
  // UPSERT: if a slot row exists, update its photo_id; otherwise insert one.
  // Lets updatePageTemplate skip pre-creating empty slot rows when growing
  // a template — the picker can write to any (page, slot_index) pair.
  await d.execute(
    `INSERT INTO page_slot (page_id, slot_index, photo_id) VALUES (?, ?, ?)
     ON CONFLICT (page_id, slot_index) DO UPDATE SET photo_id = excluded.photo_id`,
    [pageId, slotIndex, photoId]
  );
  await bumpSelectionFromPage(pageId);
}

// Internal: bump selection.updated_at for the selection that owns this page.
async function bumpSelectionFromPage(pageId: number): Promise<void> {
  const d = await db();
  await d.execute(
    `UPDATE selection SET updated_at = ?
     WHERE id = (SELECT selection_id FROM page WHERE id = ?)`,
    [Date.now(), pageId]
  );
}

export async function listPagesForSelection(selectionId: number): Promise<PageRow[]> {
  const d = await db();
  return d.select<PageRow[]>(
    'SELECT * FROM page WHERE selection_id = ? ORDER BY index_in_book ASC',
    [selectionId]
  );
}

// Returns slots for a set of page IDs, joined with photo path + thumb + embedding.
// Used by the review route to render all pages in one shot.
export async function listSlotsForPages(pageIds: number[]): Promise<Array<PageSlotRow & { path: string | null; thumb_path: string | null; embedding: string | null }>> {
  if (pageIds.length === 0) return [];
  const d = await db();
  const placeholders = pageIds.map(() => '?').join(',');
  return d.select<Array<PageSlotRow & { path: string | null; thumb_path: string | null; embedding: string | null }>>(
    `SELECT ps.*, p.path, p.thumb_path, ie.vector as embedding
     FROM page_slot ps
     LEFT JOIN photo p ON p.id = ps.photo_id
     LEFT JOIN image_embedding ie ON ie.photo_id = ps.photo_id
     WHERE ps.page_id IN (${placeholders})
     ORDER BY ps.page_id ASC, ps.slot_index ASC`,
    pageIds
  );
}

export async function clearPagesForSelection(selectionId: number): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM page WHERE selection_id = ?', [selectionId]);
}

/** Shape returned by enrichSlotsWithLayoutContext — used by review-route
 *  loaders. Each enriched slot carries the photo's natural dimensions,
 *  face boxes, and top scene tag so the renderer can compute auto-position. */
export interface SlotLayoutContext {
  photo_width: number | null;
  photo_height: number | null;
  faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
  top_tag: string | null;
}

/** Given slot rows from listSlotsForPages, fetch each referenced photo's
 *  natural dimensions, face boxes, and top scene tag in three bulk queries.
 *  Returns the slots with those four fields attached. Slots whose photo_id
 *  is null get null/empty values.
 *
 *  Expected scale: a single selection's slots (typically ≤ 500 photos);
 *  parameter cap on modern SQLite is 32766, so safe well past practical use. */
export async function enrichSlotsWithLayoutContext<S extends { photo_id: number | null }>(
  slots: readonly S[],
): Promise<Array<S & SlotLayoutContext>> {
  const photoIds = [...new Set(slots.map((s) => s.photo_id).filter((x): x is number => x !== null))];
  const photoMeta = new Map<number, { width: number | null; height: number | null }>();
  const facesByPhoto = new Map<number, Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>>();
  const topTagByPhoto = new Map<number, string>();

  if (photoIds.length > 0) {
    const d = await db();
    const placeholders = photoIds.map(() => '?').join(',');

    const photoRows = await d.select<{ id: number; width: number | null; height: number | null }[]>(
      `SELECT id, width, height FROM photo WHERE id IN (${placeholders})`,
      photoIds
    );
    for (const p of photoRows) photoMeta.set(p.id, { width: p.width, height: p.height });

    const faceRows = await d.select<{ photo_id: number; bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }[]>(
      `SELECT photo_id, bbox_x, bbox_y, bbox_w, bbox_h FROM face WHERE photo_id IN (${placeholders})`,
      photoIds
    );
    for (const f of faceRows) {
      const arr = facesByPhoto.get(f.photo_id) ?? [];
      arr.push({ bbox_x: f.bbox_x, bbox_y: f.bbox_y, bbox_w: f.bbox_w, bbox_h: f.bbox_h });
      facesByPhoto.set(f.photo_id, arr);
    }

    const tagRows = await d.select<{ photo_id: number; tag: string }[]>(
      `SELECT pt.photo_id, pt.tag FROM photo_tag pt
       INNER JOIN (
         SELECT photo_id, MAX(score) as ms FROM photo_tag WHERE photo_id IN (${placeholders}) GROUP BY photo_id
       ) m ON m.photo_id = pt.photo_id AND m.ms = pt.score
       WHERE pt.photo_id IN (${placeholders})`,
      [...photoIds, ...photoIds]
    );
    for (const t of tagRows) topTagByPhoto.set(t.photo_id, t.tag);
  }

  return slots.map((s) => {
    const meta = s.photo_id !== null ? photoMeta.get(s.photo_id) : null;
    return {
      ...s,
      photo_width: meta?.width ?? null,
      photo_height: meta?.height ?? null,
      faces: s.photo_id !== null ? (facesByPhoto.get(s.photo_id) ?? []) : [],
      top_tag: s.photo_id !== null ? (topTagByPhoto.get(s.photo_id) ?? null) : null,
    };
  });
}

// ---- Picker candidates with scope filter ----

export type PickerScope = 'bucket' | 'nearby' | 'all';

export async function listCandidatesForPicker(args: {
  projectId: number;
  bucketKey: string;
  kind: 'album' | 'calendar';
  scope: PickerScope;
  sourceYear?: number;
}): Promise<Array<{ id: number; path: string; thumb_path: string | null; taken_at: number | null; score: number | null; embedding: string | null }>> {
  const d = await db();

  // Build the time-range filter clause based on scope + kind.
  let rangeStart: number | null = null;
  let rangeEnd: number | null = null;

  if (args.scope === 'bucket') {
    if (args.kind === 'album') {
      const dayStart = new Date(`${args.bucketKey}T00:00:00`).getTime();
      rangeStart = dayStart;
      rangeEnd = dayStart + 24 * 60 * 60 * 1000;
    } else {
      if (args.sourceYear === undefined) throw new Error('sourceYear required for calendar bucket');
      const month = Number(args.bucketKey.slice(5, 7));
      rangeStart = new Date(args.sourceYear, month - 1, 1).getTime();
      rangeEnd = new Date(args.sourceYear, month, 1).getTime();
    }
  } else if (args.scope === 'nearby') {
    if (args.kind === 'album') {
      const month = Number(args.bucketKey.slice(5, 7));
      const year = Number(args.bucketKey.slice(0, 4));
      rangeStart = new Date(year, month - 1, 1).getTime();
      rangeEnd = new Date(year, month, 1).getTime();
    } else {
      if (args.sourceYear === undefined) throw new Error('sourceYear required for calendar bucket');
      rangeStart = new Date(args.sourceYear, 0, 1).getTime();
      rangeEnd = new Date(args.sourceYear + 1, 0, 1).getTime();
    }
  }

  if (rangeStart === null) {
    return d.select<Array<{ id: number; path: string; thumb_path: string | null; taken_at: number | null; score: number | null; embedding: string | null }>>(
      `SELECT p.id, p.path, p.thumb_path, p.taken_at,
              (SELECT cv.blur FROM cv_score cv WHERE cv.photo_id = p.id) as score,
              (SELECT ie.vector FROM image_embedding ie WHERE ie.photo_id = p.id) as embedding
       FROM photo p
       WHERE p.project_id = ?
       ORDER BY p.taken_at ASC, p.id ASC`,
      [args.projectId]
    );
  }
  return d.select<Array<{ id: number; path: string; thumb_path: string | null; taken_at: number | null; score: number | null; embedding: string | null }>>(
    `SELECT p.id, p.path, p.thumb_path, p.taken_at,
            (SELECT cv.blur FROM cv_score cv WHERE cv.photo_id = p.id) as score,
            (SELECT ie.vector FROM image_embedding ie WHERE ie.photo_id = p.id) as embedding
     FROM photo p
     WHERE p.project_id = ?
       AND p.taken_at IS NOT NULL
       AND p.taken_at >= ?
       AND p.taken_at < ?
     ORDER BY p.taken_at ASC, p.id ASC`,
    [args.projectId, rangeStart, rangeEnd]
  );
}

export async function getPhotoTakenAt(photoId: number): Promise<number | null> {
  const d = await db();
  const rows = await d.select<{ taken_at: number | null }[]>(
    'SELECT taken_at FROM photo WHERE id = ?', [photoId]
  );
  return rows[0]?.taken_at ?? null;
}

// ---- Page operations (Phase 3c) ----

/**
 * Move a page up or down in its selection (swap index_in_book with the
 * adjacent page). No-op at the boundaries.
 */
export async function reorderPage(pageId: number, direction: 'up' | 'down'): Promise<void> {
  const d = await db();
  const rows = await d.select<{ id: number; selection_id: number; index_in_book: number }[]>(
    'SELECT id, selection_id, index_in_book FROM page WHERE id = ?', [pageId]
  );
  if (rows.length === 0) return;
  const page = rows[0];
  const otherIndex = direction === 'up' ? page.index_in_book - 1 : page.index_in_book + 1;
  if (otherIndex < 0) return;
  const others = await d.select<{ id: number; index_in_book: number }[]>(
    'SELECT id, index_in_book FROM page WHERE selection_id = ? AND index_in_book = ?',
    [page.selection_id, otherIndex]
  );
  if (others.length === 0) return;
  // Swap via a sentinel value to be robust against future unique
  // constraints on (selection_id, index_in_book).
  await d.execute('UPDATE page SET index_in_book = -1 WHERE id = ?', [page.id]);
  await d.execute('UPDATE page SET index_in_book = ? WHERE id = ?', [page.index_in_book, others[0].id]);
  await d.execute('UPDATE page SET index_in_book = ? WHERE id = ?', [otherIndex, page.id]);
  await d.execute('UPDATE selection SET updated_at = ? WHERE id = ?', [Date.now(), page.selection_id]);
}

/**
 * Swap the template of a page. Keeps the page's slot rows intact so
 * photos beyond the new template's slot_count survive as "page memory":
 * if the user shrinks (4→1) then grows back (1→4), the original
 * photos in slots 1-3 reappear. Slot rows at indices the new template
 * doesn't include simply aren't rendered by PageView.
 *
 * The `newSlotCount` param is accepted for backward compatibility but
 * intentionally unused — slot rows aren't created or deleted here.
 * updateSlotPhoto upserts, so empty slots the user clicks into get
 * their row created on first write.
 */
export async function updatePageTemplate(pageId: number, newTemplateId: string, _newSlotCount: number): Promise<void> {
  const d = await db();
  await d.execute('UPDATE page SET template_id = ? WHERE id = ?', [newTemplateId, pageId]);
  await bumpSelectionFromPage(pageId);
}

/**
 * Delete a page and re-densify the remaining pages' index_in_book so
 * the sequence stays 0, 1, 2, ... without gaps. ON DELETE CASCADE on
 * page_slot.page_id removes the slot rows automatically.
 */
export async function deletePage(pageId: number): Promise<void> {
  const d = await db();
  const rows = await d.select<{ id: number; selection_id: number; index_in_book: number }[]>(
    'SELECT id, selection_id, index_in_book FROM page WHERE id = ?', [pageId]
  );
  if (rows.length === 0) return;
  const { selection_id, index_in_book } = rows[0];
  await d.execute('DELETE FROM page WHERE id = ?', [pageId]);
  await d.execute(
    'UPDATE page SET index_in_book = index_in_book - 1 WHERE selection_id = ? AND index_in_book > ?',
    [selection_id, index_in_book]
  );
  await d.execute('UPDATE selection SET updated_at = ? WHERE id = ?', [Date.now(), selection_id]);
}

export async function countPagesForSelection(selectionId: number): Promise<number> {
  const d = await db();
  const rows = await d.select<{ n: number }[]>(
    'SELECT COUNT(*) as n FROM page WHERE selection_id = ?', [selectionId]
  );
  return rows[0]?.n ?? 0;
}

export async function getMaxIndexedAt(projectId: number): Promise<number | null> {
  const d = await db();
  const rows = await d.select<{ max_indexed: number | null }[]>(
    'SELECT MAX(indexed_at) as max_indexed FROM photo WHERE project_id = ?', [projectId]
  );
  return rows[0]?.max_indexed ?? null;
}

/**
 * Replace the index_in_book of every page in a selection in one
 * batch. Caller provides page IDs in the desired final order.
 *
 * Uses a sentinel pass (negative indices first) to avoid colliding
 * with anything else in case a future unique constraint exists on
 * (selection_id, index_in_book).
 */
export async function setPageOrder(selectionId: number, orderedPageIds: number[]): Promise<void> {
  const d = await db();
  for (let i = 0; i < orderedPageIds.length; i++) {
    await d.execute(
      'UPDATE page SET index_in_book = ? WHERE id = ? AND selection_id = ?',
      [-(i + 1), orderedPageIds[i], selectionId]
    );
  }
  for (let i = 0; i < orderedPageIds.length; i++) {
    await d.execute(
      'UPDATE page SET index_in_book = ? WHERE id = ? AND selection_id = ?',
      [i, orderedPageIds[i], selectionId]
    );
  }
  await d.execute('UPDATE selection SET updated_at = ? WHERE id = ?', [Date.now(), selectionId]);
}

export async function updateSlotTransform(pageId: number, slotIndex: number, transformJson: string | null): Promise<void> {
  const d = await db();
  // UPSERT so a slot row exists even if the user hasn't picked a photo for
  // it yet (rare but possible if they jump straight to crop adjustment).
  await d.execute(
    `INSERT INTO page_slot (page_id, slot_index, photo_id, transform_json) VALUES (?, ?, NULL, ?)
     ON CONFLICT (page_id, slot_index) DO UPDATE SET transform_json = excluded.transform_json`,
    [pageId, slotIndex, transformJson]
  );
  await bumpSelectionFromPage(pageId);
}

/** Insert a blank page at the given index_in_book, shifting later pages
 *  down by 1. Returns the new page's id. */
export async function insertBlankPage(args: {
  selection_id: number;
  insert_at: number;
  template_id: string;
}): Promise<number> {
  const d = await db();
  await d.execute(
    'UPDATE page SET index_in_book = index_in_book + 1 WHERE selection_id = ? AND index_in_book >= ?',
    [args.selection_id, args.insert_at]
  );
  const r = await d.execute(
    'INSERT INTO page (selection_id, index_in_book, template_id) VALUES (?, ?, ?)',
    [args.selection_id, args.insert_at, args.template_id]
  );
  await d.execute('UPDATE selection SET updated_at = ? WHERE id = ?', [Date.now(), args.selection_id]);
  return r.lastInsertId as number;
}

/** Photo's natural dimensions + the face boxes for that photo, used by
 *  auto-position. Returns null if the photo isn't found or has no
 *  dimensions. */
export async function getPhotoLayoutContext(photoId: number): Promise<{ width: number; height: number; faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>; topTag: string | null } | null> {
  const d = await db();
  const photos = await d.select<{ width: number | null; height: number | null }[]>(
    'SELECT width, height FROM photo WHERE id = ?', [photoId]
  );
  const p = photos[0];
  if (!p || p.width === null || p.height === null) return null;
  const faces = await d.select<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }[]>(
    'SELECT bbox_x, bbox_y, bbox_w, bbox_h FROM face WHERE photo_id = ?', [photoId]
  );
  const tagRows = await d.select<{ tag: string }[]>(
    'SELECT tag FROM photo_tag WHERE photo_id = ? ORDER BY score DESC LIMIT 1', [photoId]
  );
  return { width: p.width, height: p.height, faces, topTag: tagRows[0]?.tag ?? null };
}

export async function listEvents(projectId: number): Promise<CalendarEventRow[]> {
  const d = await db();
  return d.select<CalendarEventRow[]>(
    'SELECT * FROM calendar_event WHERE project_id = ? ORDER BY month, day, label',
    [projectId]
  );
}

export async function addEvent(args: {
  project_id: number;
  month: number;
  day: number;
  year: number | null;
  kind: 'birthday' | 'anniversary' | 'event' | 'holiday';
  label: string;
}): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `INSERT INTO calendar_event (project_id, month, day, year, kind, label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [args.project_id, args.month, args.day, args.year, args.kind, args.label, Date.now()]
  );
  return r.lastInsertId as number;
}

export async function updateEvent(id: number, fields: Partial<{
  month: number;
  day: number;
  year: number | null;
  kind: 'birthday' | 'anniversary' | 'event' | 'holiday';
  label: string;
}>): Promise<void> {
  const d = await db();
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    cols.push(`${k} = ?`);
    vals.push(v);
  }
  if (cols.length === 0) return;
  vals.push(id);
  await d.execute(`UPDATE calendar_event SET ${cols.join(', ')} WHERE id = ?`, vals);
}

export async function deleteEvent(id: number): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM calendar_event WHERE id = ?', [id]);
}

export async function updateProjectWeekStart(id: number, weekStart: 0 | 1): Promise<void> {
  const d = await db();
  await d.execute('UPDATE project SET week_start = ? WHERE id = ?', [weekStart, id]);
}
