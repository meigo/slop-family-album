import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { upsertPhoto, getProject } from '$lib/db';
import { readExifViaSidecar, makeThumbViaSidecar } from '$lib/sidecar/client';
import type { Writable } from 'svelte/store';
import type { IndexProgress } from './progress';

interface ScannedFile { path: string; size: number; modified: number; }

export async function indexProject(projectId: number, progress: Writable<IndexProgress>): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  progress.set({ phase: 'walking', scanned: 0, total: 0, current: project.source_dir, errors: [] });
  const files = await invoke<ScannedFile[]>('walk_image_dir', { dir: project.source_dir });
  const total = files.length;

  const appDir = await appDataDir();
  const thumbDir = await join(appDir, 'projects', String(projectId), 'thumbs');

  progress.update((p) => ({ ...p, phase: 'indexing', total }));

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    progress.update((p) => ({ ...p, scanned: i, current: f.path }));
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
      progress.update((p) => ({ ...p, errors: [...p.errors, `${f.path}: ${err}`] }));
    }
  }

  progress.update((p) => ({ ...p, phase: 'done', scanned: total }));
}
