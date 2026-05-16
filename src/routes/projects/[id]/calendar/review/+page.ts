import {
  getProject,
  getCurrentSelection,
  listPagesForSelection,
  listSlotsForPages,
  enrichSlotsWithLayoutContext,
  listEvents,
} from '$lib/db';
import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export async function load({ params }) {
  const id = Number(params.id);
  const project = await getProject(id);
  if (!project) throw error(404, 'Project not found');
  const selection = await getCurrentSelection(id, 'calendar');
  const events = await listEvents(id);
  const pages = selection ? await listPagesForSelection(selection.id) : [];
  const slots = pages.length > 0 ? await listSlotsForPages(pages.map((p) => p.id)) : [];
  const enriched = await enrichSlotsWithLayoutContext(slots);

  const slotsByPage = new Map<number, typeof enriched>();
  for (const s of enriched) {
    const arr = slotsByPage.get(s.page_id) ?? [];
    arr.push(s);
    slotsByPage.set(s.page_id, arr);
  }
  return { project, selection, pages, slotsByPage, events };
}
