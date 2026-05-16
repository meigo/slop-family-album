import { getProject, countPhotos, getCurrentSelection, countPagesForSelection, getMaxIndexedAt } from '$lib/db';
import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export async function load({ params }) {
  const id = Number(params.id);
  const project = await getProject(id);
  if (!project) throw error(404, 'Project not found');
  const count = await countPhotos(id);
  const albumSelection = await getCurrentSelection(id, 'album');
  const calendarSelection = await getCurrentSelection(id, 'calendar');
  const albumPageCount = albumSelection ? await countPagesForSelection(albumSelection.id) : 0;
  const calendarPageCount = calendarSelection ? await countPagesForSelection(calendarSelection.id) : 0;
  const lastIndexedAt = await getMaxIndexedAt(id);
  return {
    project, count,
    albumSelection, calendarSelection,
    albumPageCount, calendarPageCount,
    lastIndexedAt,
  };
}
