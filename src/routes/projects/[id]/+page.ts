import { getProject, countPhotos, getCurrentSelection } from '$lib/db';
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
  return { project, count, albumSelection, calendarSelection };
}
