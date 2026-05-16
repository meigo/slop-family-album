import { getProject, getCurrentSelection, listPagesForSelection, listSlotsForPages } from '$lib/db';
import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export async function load({ params }) {
  const id = Number(params.id);
  const project = await getProject(id);
  if (!project) throw error(404, 'Project not found');
  const selection = await getCurrentSelection(id, 'album');
  const pages = selection ? await listPagesForSelection(selection.id) : [];
  const slots = pages.length > 0 ? await listSlotsForPages(pages.map((p) => p.id)) : [];
  const slotsByPage = new Map<number, typeof slots>();
  for (const s of slots) {
    const arr = slotsByPage.get(s.page_id) ?? [];
    arr.push(s);
    slotsByPage.set(s.page_id, arr);
  }
  return { project, selection, pages, slotsByPage };
}
