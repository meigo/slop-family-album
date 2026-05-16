import {
  listSelectedPhotos, listPhotos, getProject, getCurrentSelection,
  insertPage, insertPageSlot, clearPagesForSelection,
} from '$lib/db';
import { pickAlbumTemplate, pickCalendarTemplate } from './picker';

/**
 * Build pages for the current album selection of a project. Replaces
 * any existing pages.
 *
 * Each date bucket from the selection becomes one page (chunked into
 * trio-asym + hero-1 overflow if >3 photos in a day, though Phase 3a's
 * per_day_cap = 3 means this rarely matters).
 */
export async function assembleAlbumPages(projectId: number): Promise<void> {
  const selection = await getCurrentSelection(projectId, 'album');
  if (!selection) throw new Error(`No current album selection for project ${projectId}`);
  await clearPagesForSelection(selection.id);

  const allPhotos = await listPhotos(projectId);
  const photoById = new Map(allPhotos.map((p) => [p.id, p]));

  const sel = await listSelectedPhotos(selection.id);

  const byDay = new Map<string, typeof sel>();
  for (const s of sel) {
    const arr = byDay.get(s.bucket_key) ?? [];
    arr.push(s);
    byDay.set(s.bucket_key, arr);
  }

  let pageIndex = 0;
  // listSelectedPhotos returns rows ordered by bucket_key ASC, so the
  // Map iteration order preserves chronological order.
  for (const day of byDay.keys()) {
    const dayPhotos = byDay.get(day)!;
    const orientations = dayPhotos.map((sp): 'portrait' | 'landscape' => {
      const ph = photoById.get(sp.photo_id);
      if (!ph || !ph.width || !ph.height) return 'landscape';
      return ph.height >= ph.width ? 'portrait' : 'landscape';
    });
    let i = 0;
    while (i < dayPhotos.length) {
      const remaining = dayPhotos.length - i;
      const take = remaining >= 3 ? 3 : remaining;
      const chunk = dayPhotos.slice(i, i + take);
      const chunkOrient = orientations.slice(i, i + take);
      const template = pickAlbumTemplate(take, chunkOrient);
      const pageId = await insertPage({
        selection_id: selection.id,
        index_in_book: pageIndex,
        template_id: template.id,
        title: day,
      });
      for (let s = 0; s < chunk.length; s++) {
        await insertPageSlot({
          page_id: pageId,
          slot_index: s,
          photo_id: chunk[s].photo_id,
        });
      }
      pageIndex++;
      i += take;
    }
  }
}

/**
 * Build calendar pages — always 12, one per month. Each page uses the
 * 'cal-month' template (single full-bleed photo slot). If a month has
 * no selected photo, the slot is created with photo_id = null and the
 * user can fill it via the picker.
 */
export async function assembleCalendarPages(projectId: number): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  const selection = await getCurrentSelection(projectId, 'calendar');
  if (!selection) throw new Error(`No current calendar selection for project ${projectId}`);
  await clearPagesForSelection(selection.id);

  const sel = await listSelectedPhotos(selection.id);
  const byMonth = new Map<string, typeof sel>();
  for (const s of sel) {
    const arr = byMonth.get(s.bucket_key) ?? [];
    arr.push(s);
    byMonth.set(s.bucket_key, arr);
  }

  const template = pickCalendarTemplate();
  for (let month = 1; month <= 12; month++) {
    const bucketKey = `${project.calendar_year}-${month.toString().padStart(2, '0')}`;
    const monthPhotos = byMonth.get(bucketKey) ?? [];
    const pageId = await insertPage({
      selection_id: selection.id,
      index_in_book: month - 1,
      template_id: template.id,
      title: bucketKey,
    });
    await insertPageSlot({
      page_id: pageId,
      slot_index: 0,
      photo_id: monthPhotos[0]?.photo_id ?? null,
    });
  }
}
