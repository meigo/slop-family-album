export interface ProjectRow {
  id: number;
  name: string;
  source_dir: string;
  album_year: number;
  calendar_year: number;
  created_at: number;
  slot_gap_px: number;
  page_padding_px: number;
  week_start: number;
  page_bg_color: string;
  /** Deprecated by page_size_w_mm/page_size_h_mm but kept for safe
   *  rollback; not read by any current code. */
  page_aspect: string | null;
  album_max_pages: number | null;
  slot_corner_radius_px: number;
  page_size_w_mm: number;
  page_size_h_mm: number;
  /** Google Fonts family name applied to the calendar grid (heading,
   *  day headers, dates). NULL = app default (monospace). */
  calendar_font_family: string | null;
  /** Hex color (#rrggbb) for calendar grid text + cell borders. */
  calendar_color: string;
  /** Calendar grid cell rules: 'boxed' (full border), 'lines'
   *  (horizontal dividers only), or 'none' (no rules). */
  calendar_grid_style: string;
  /** Hex color (#rrggbb) for Sunday column header + Sunday date cells.
   *  Defaults to red. Set equal to calendar_color to disable. */
  calendar_weekend_color: string;
}

export interface CalendarEventRow {
  id: number;
  project_id: number;
  month: number; // 1..12
  day: number;   // 1..31
  year: number | null; // null = yearly recurring
  kind: 'birthday' | 'anniversary' | 'event' | 'holiday';
  label: string;
  created_at: number;
}

export interface PhotoRow {
  id: number;
  project_id: number;
  path: string;
  sha256: string;
  taken_at: number | null;
  width: number | null;
  height: number | null;
  orientation: number | null;
  exif_json: string | null;
  thumb_path: string | null;
  indexed_at: number;
}

export interface PhotoInsert {
  project_id: number;
  path: string;
  sha256: string;
  taken_at: number | null;
  width: number | null;
  height: number | null;
  orientation: number | null;
  exif_json: string | null;
  thumb_path: string | null;
  indexed_at: number;
}

export interface CvScoreRow {
  photo_id: number;
  blur: number | null;
  faces_count: number | null;
  faces_json: string | null;
  phash: string | null;
  exposure: number | null;
  computed_at: number;
}

export interface CvScoreInsert {
  photo_id: number;
  blur: number | null;
  faces_count: number | null;
  faces_json: string | null;
  phash: string | null;
  computed_at: number;
}

export interface DuplicateGroupRow {
  id: number;
  project_id: number;
  representative_photo_id: number;
  created_at: number;
}

export interface ImageEmbeddingRow {
  photo_id: number;
  model: string;
  vector: string;          // base64-encoded float32 little-endian
  computed_at: number;
}

export interface PhotoTagRow {
  photo_id: number;
  tag: string;
  score: number;
}

export interface FaceRow {
  id: number;
  photo_id: number;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  embedding: string;       // base64-encoded float32 little-endian
  quality: number | null;
  cluster_id: number | null;
  computed_at: number;
}

export interface FaceInsert {
  photo_id: number;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  embedding: string;
  quality: number | null;
  computed_at: number;
}

export interface PersonClusterRow {
  id: number;
  project_id: number;
  name: string | null;
  is_pinned: number;
  created_at: number;
}

export interface SelectionRow {
  id: number;
  project_id: number;
  kind: string;
  generated_at: number;
  is_current: number;
  updated_at: number | null;
}

export interface SelectedPhotoRow {
  selection_id: number;
  photo_id: number;
  bucket_key: string;
  rank: number;
  score: number | null;
  user_state: string;
  notes: string | null;
}

export interface SelectedPhotoInsert {
  selection_id: number;
  photo_id: number;
  bucket_key: string;
  rank: number;
  score: number | null;
  user_state?: string;
  notes?: string | null;
}

export interface PageRow {
  id: number;
  selection_id: number;
  index_in_book: number;
  template_id: string;
  title: string | null;
  body: string | null;
}

export interface PageInsert {
  selection_id: number;
  index_in_book: number;
  template_id: string;
  title?: string | null;
  body?: string | null;
}

export interface PageSlotRow {
  page_id: number;
  slot_index: number;
  photo_id: number | null;
  transform_json: string | null;
}

export interface PageSlotInsert {
  page_id: number;
  slot_index: number;
  photo_id: number | null;
  transform_json?: string | null;
}

export interface PageTextRow {
  id: number;
  page_id: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  content: string;
  style_json: string;
  z_order: number;
  created_at: number;
}
