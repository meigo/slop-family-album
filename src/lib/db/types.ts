export interface ProjectRow {
  id: number;
  name: string;
  source_dir: string;
  album_year: number;
  calendar_year: number;
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
}

export interface SelectedPhotoRow {
  selection_id: number;
  photo_id: number;
  bucket_key: string;
  rank: number;
  score: number | null;
  user_state: string;
}

export interface SelectedPhotoInsert {
  selection_id: number;
  photo_id: number;
  bucket_key: string;
  rank: number;
  score: number | null;
  user_state?: string;
}
