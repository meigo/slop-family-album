import {
  getProject, getCurrentSelection, listPagesForSelection, listSlotsForPages,
  listPageText,
} from '$lib/db';
import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export async function load({ params }) {
  const id = Number(params.id);
  const project = await getProject(id);
  if (!project) throw error(404, 'Project not found');
  const selection = await getCurrentSelection(id, 'album');
  if (!selection) {
    return { project, selection: null, pages: [], slotsByPage: new Map(), textsByPage: new Map() };
  }
  const pages = await listPagesForSelection(selection.id);
  const slots = await listSlotsForPages(pages.map((p) => p.id));
  const slotsByPage = new Map<number, typeof slots>();
  for (const s of slots) {
    const arr = slotsByPage.get(s.page_id) ?? [];
    arr.push(s);
    slotsByPage.set(s.page_id, arr);
  }
  const texts = pages.length > 0 ? await listPageText(pages.map((p) => p.id)) : [];
  const textsByPage = new Map<number, typeof texts>();
  for (const t of texts) {
    const arr = textsByPage.get(t.page_id) ?? [];
    arr.push(t);
    textsByPage.set(t.page_id, arr);
  }
  return { project, selection, pages, slotsByPage, textsByPage };
}
