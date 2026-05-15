import { getProject, getCurrentSelection, listSelectedPhotos } from '$lib/db';
import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export async function load({ params }) {
  const id = Number(params.id);
  if (params.kind !== 'album' && params.kind !== 'calendar') {
    throw error(404, 'Unknown selection kind');
  }
  const kind: 'album' | 'calendar' = params.kind;
  const project = await getProject(id);
  if (!project) throw error(404, 'Project not found');
  const selection = await getCurrentSelection(id, kind);
  if (!selection) {
    return { project, kind, selection: null, photosByBucket: new Map() };
  }
  const photos = await listSelectedPhotos(selection.id);
  // Group by bucket_key (already sorted ASC; rank ASC within).
  const photosByBucket = new Map<string, typeof photos>();
  for (const p of photos) {
    const arr = photosByBucket.get(p.bucket_key) ?? [];
    arr.push(p);
    photosByBucket.set(p.bucket_key, arr);
  }
  return { project, kind, selection, photosByBucket };
}
