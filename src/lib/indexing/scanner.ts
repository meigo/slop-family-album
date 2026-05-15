import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import {
  upsertPhoto, getProject, listIndexedAtByPath,
  upsertCvScore, listCvComputedAtByPhotoId, listPhotos,
} from '$lib/db';
import { readExifViaSidecar, makeThumbViaSidecar } from '$lib/sidecar/client';
import { blurViaPy, phashViaPy, facesViaPy } from '$lib/sidecar/py-client';
import { indexProgress } from './progress';
import { detectDuplicates } from './dedup';

interface ScannedFile { path: string; size: number; modified: number; }

export async function indexProject(projectId: number): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  indexProgress.set({ phase: 'walking', scanned: 0, total: 0, current: project.source_dir, errors: [], projectId });
  const files = await invoke<ScannedFile[]>('walk_image_dir', { dir: project.source_dir });
  const total = files.length;

  const lastIndexedByPath = await listIndexedAtByPath(projectId);

  const appDir = await appDataDir();
  const thumbDir = await join(appDir, 'projects', String(projectId), 'thumbs');

  indexProgress.update((p) => ({ ...p, phase: 'indexing', total }));

  // ---- INDEXING PASS ----
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    indexProgress.update((p) => ({ ...p, scanned: i, current: f.path }));

    const prev = lastIndexedByPath.get(f.path);
    if (prev !== undefined && prev >= f.modified * 1000) {
      continue;
    }

    try {
      const sha256 = await invoke<string>('hash_file', { path: f.path });
      const exif = await readExifViaSidecar(f.path);
      const thumbPath = await join(thumbDir, `${sha256}.jpg`);
      await makeThumbViaSidecar(f.path, thumbPath, 256);

      await upsertPhoto({
        project_id: projectId,
        path: f.path,
        sha256,
        taken_at: exif.taken_at ? Date.parse(exif.taken_at) : (f.modified * 1000),
        width: exif.width,
        height: exif.height,
        orientation: exif.orientation,
        exif_json: exif.exif_json,
        thumb_path: thumbPath,
        indexed_at: Date.now(),
      });
    } catch (err) {
      indexProgress.update((p) => ({ ...p, errors: [...p.errors, `${f.path}: ${err}`] }));
    }
  }

  // ---- CV PASS ----
  indexProgress.update((p) => ({ ...p, phase: 'indexing', current: 'running CV pass…' }));
  const photos = await listPhotos(projectId);
  const cvComputed = await listCvComputedAtByPhotoId(projectId);

  for (let i = 0; i < photos.length; i++) {
    const ph = photos[i];
    indexProgress.update((p) => ({ ...p, scanned: i, total: photos.length, current: `cv: ${ph.path}` }));

    // Skip if CV already computed at or after the photo's last index timestamp.
    const lastCv = cvComputed.get(ph.id);
    if (lastCv !== undefined && lastCv >= ph.indexed_at) {
      continue;
    }

    try {
      const [blur, phash, facesResult] = await Promise.all([
        blurViaPy(ph.path),
        phashViaPy(ph.path),
        facesViaPy(ph.path),
      ]);
      await upsertCvScore({
        photo_id: ph.id,
        blur,
        faces_count: facesResult.count,
        faces_json: JSON.stringify(facesResult.boxes),
        phash,
        computed_at: Date.now(),
      });
    } catch (err) {
      indexProgress.update((p) => ({ ...p, errors: [...p.errors, `cv ${ph.path}: ${err}`] }));
    }
  }

  // ---- DEDUP PASS ----
  indexProgress.update((p) => ({ ...p, current: 'detecting duplicates…' }));
  await detectDuplicates(projectId);

  indexProgress.update((p) => ({ ...p, phase: 'done', scanned: total }));
}
