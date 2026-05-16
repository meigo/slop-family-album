# Family Album & Calendar Builder — Phase 3e (Sorter View + Drag-Reorder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **thumbnail-grid view** of the whole album (and calendar) where the user can drag any page to a new position. Up/down arrows from Phase 3c still work; drag-reorder is added as the more ergonomic affordance for big reshuffles. Click a thumb to jump to that page in the full review.

This phase is small and self-contained (~3 tasks). Could be executed before or after Phase 3d (slot transforms) — they're independent.

**Architecture:** A new route `/projects/[id]/album/sorter` (and calendar equivalent) renders all pages of the current selection as a grid of small `PageView` instances. Native HTML5 drag-and-drop with `draggable="true"` + `dragstart`/`dragover`/`drop`. New DB helper `setPageOrder(selectionId, orderedPageIds[])` swaps `index_in_book` for all pages in one transactional batch. Existing `reorderPage` (single up/down step) is untouched.

**Tech Stack additions:** None.

**Spec reference:** N/A — follow-on from the post-3c discussion.

**Working directory:** `/Users/meigo/Projects/slop/slop-family-album/`.

**Phase 3e NOT in scope:**
- Touch/mobile drag refinement (HTML5 native works on desktop; mobile gestures are Phase 4 if a mobile target surfaces).
- Multi-select drag (drag one page at a time in v1).
- Drag between album and calendar (no, those are different selections).

---

## File Structure

```
slop-family-album/
  src/lib/
    db/index.ts                                     # add setPageOrder helper
    components/
      PageThumb.svelte                              # NEW — small page render
  src/routes/projects/[id]/
    album/sorter/                                   # NEW route
      +page.ts
      +page.svelte
    calendar/sorter/                                # NEW route
      +page.ts
      +page.svelte
    album/review/+page.svelte                       # MODIFIED — link to sorter
    calendar/review/+page.svelte                    # MODIFIED — link to sorter
```

---

## Task 1: DB helper + PageThumb

- [ ] **Step 1: Add `setPageOrder` helper to `src/lib/db/index.ts`**

Append:

```ts
/**
 * Replace the index_in_book of every page in a selection in one
 * pass. Caller provides page IDs in the desired final order. Other
 * pages (if any) keep their relative position past the listed ones —
 * but in practice the caller passes ALL pages of the selection so the
 * full ordering is rewritten.
 *
 * Uses a sentinel pass to avoid running afoul of any future unique
 * constraint on (selection_id, index_in_book): first set every page
 * to a unique negative index, then to its final positive index.
 */
export async function setPageOrder(selectionId: number, orderedPageIds: number[]): Promise<void> {
  const d = await db();
  // Pass 1: park each page at a unique negative index, ordered to avoid
  // colliding with anything else.
  for (let i = 0; i < orderedPageIds.length; i++) {
    await d.execute(
      'UPDATE page SET index_in_book = ? WHERE id = ? AND selection_id = ?',
      [-(i + 1), orderedPageIds[i], selectionId]
    );
  }
  // Pass 2: assign final indices.
  for (let i = 0; i < orderedPageIds.length; i++) {
    await d.execute(
      'UPDATE page SET index_in_book = ? WHERE id = ? AND selection_id = ?',
      [i, orderedPageIds[i], selectionId]
    );
  }
  // Bump selection updated_at.
  await d.execute('UPDATE selection SET updated_at = ? WHERE id = ?', [Date.now(), selectionId]);
}
```

- [ ] **Step 2: Create `src/lib/components/PageThumb.svelte`**

A compact `PageView` wrapper meant to be rendered at thumbnail size (e.g., 150-180px wide). Same template positioning, smaller box, no slot-click handler (sorter clicks are for selection / drag, not photo swap).

```svelte
<script lang="ts">
  import { getTemplate, type Template } from '$lib/layout/templates';
  import { convertFileSrc } from '@tauri-apps/api/core';

  interface Slot {
    slot_index: number;
    photo_id: number | null;
    path: string | null;
    thumb_path: string | null;
  }

  interface Props {
    templateId: string;
    slots: Slot[];
    width: number;             // in px; thumb size
  }
  let { templateId, slots, width }: Props = $props();

  let tpl = $derived<Template>(getTemplate(templateId));
  let aspectRatio = $derived(tpl.aspect === 'square' ? '1 / 1' : '4 / 3');
  let orderedSlots = $derived([...slots].sort((a, b) => a.slot_index - b.slot_index));
</script>

<div
  class="relative overflow-hidden"
  style="
    width: {width}px;
    aspect-ratio: {aspectRatio};
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    pointer-events: none;
  "
>
  {#each tpl.slots as slotLayout, i}
    {@const slot = orderedSlots[i]}
    <div
      class="absolute"
      style="
        left: {slotLayout.x * 100}%;
        top: {slotLayout.y * 100}%;
        width: {slotLayout.w * 100}%;
        height: {slotLayout.h * 100}%;
        padding: 1px;
      "
    >
      <div class="w-full h-full overflow-hidden" style="background: var(--color-line);">
        {#if slot?.thumb_path}
          <!-- Use thumb_path (256px) for the sorter — thumbnails are small,
               full-res originals would be wasteful here. -->
          <img
            src={convertFileSrc(slot.thumb_path)}
            alt=""
            class="w-full h-full object-cover"
            draggable="false"
          />
        {/if}
      </div>
    </div>
  {/each}
</div>
```

Note: `PageThumb` uses **thumbnails** (`thumb_path`, 256px) rather than originals — sorter renders many pages at once, so we want fast decoding + low memory. The slot photos here are decorative previews, not the final-quality view.

- [ ] **Step 3: Verify build**

```bash
npm run build && npm run check
```

Both must pass.

- [ ] **Step 4: Commit + push**

```bash
git add src/lib/db/index.ts src/lib/components/PageThumb.svelte
git commit -m "Sorter foundation: setPageOrder DB helper + PageThumb component"
git push origin main
```

---

## Task 2: Sorter routes (album + calendar) with drag-reorder

- [ ] **Step 1: Create `src/routes/projects/[id]/album/sorter/+page.ts`**

Same loader pattern as `album/review/+page.ts`, but doesn't need to enrich slots with face/dim data (PageThumb renders thumbnails only).

```ts
import {
  getProject, getCurrentSelection, listPagesForSelection, listSlotsForPages,
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
    return { project, selection: null, pages: [], slotsByPage: new Map() };
  }
  const pages = await listPagesForSelection(selection.id);
  const slots = await listSlotsForPages(pages.map((p) => p.id));
  const slotsByPage = new Map<number, typeof slots>();
  for (const s of slots) {
    const arr = slotsByPage.get(s.page_id) ?? [];
    arr.push(s);
    slotsByPage.set(s.page_id, arr);
  }
  return { project, selection, pages, slotsByPage };
}
```

- [ ] **Step 2: Create `src/routes/projects/[id]/album/sorter/+page.svelte`**

Grid of PageThumb instances, each draggable. Drop reorders.

```svelte
<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageThumb from '$lib/components/PageThumb.svelte';
  import { setPageOrder } from '$lib/db';
  import { invalidateAll, goto } from '$app/navigation';

  let { data } = $props();

  // Local mutable copy of pages so we can do an optimistic reorder during
  // drag, persist to DB on drop.
  let localOrder = $state<typeof data.pages>([]);
  $effect(() => { localOrder = [...data.pages]; });

  let draggingId = $state<number | null>(null);
  let overIdx = $state<number | null>(null);

  function onDragStart(e: DragEvent, pageId: number) {
    draggingId = pageId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(pageId));
    }
  }

  function onDragOver(e: DragEvent, idx: number) {
    e.preventDefault();  // required to allow drop
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    overIdx = idx;
  }

  async function onDrop(e: DragEvent, dropIdx: number) {
    e.preventDefault();
    overIdx = null;
    if (draggingId === null) return;
    const fromIdx = localOrder.findIndex((p) => p.id === draggingId);
    if (fromIdx === -1 || fromIdx === dropIdx) {
      draggingId = null;
      return;
    }
    // Remove from old position, insert at new.
    const next = [...localOrder];
    const [moved] = next.splice(fromIdx, 1);
    // Adjust insert index if removing earlier item shifts the target.
    const insertAt = fromIdx < dropIdx ? dropIdx - 1 : dropIdx;
    next.splice(insertAt, 0, moved);
    localOrder = next;
    draggingId = null;
    // Persist.
    if (!data.selection) return;
    await setPageOrder(data.selection.id, next.map((p) => p.id));
    await invalidateAll();
  }

  function onDragEnd() {
    draggingId = null;
    overIdx = null;
  }

  function openInReview(pageId: number) {
    // Just navigate to the review page. Anchoring to a specific page would
    // need an id on each section element; v1 just goes to top of review.
    goto(`/projects/${data.project.id}/album/review`);
  }
</script>

<div class="container-page" style="max-width: 1100px;">
  <PageHeader backHref={`/projects/${data.project.id}`}>
    <h1 class="text-xl font-medium">{data.project.name} — album sorter</h1>
  </PageHeader>

  {#if !data.selection || localOrder.length === 0}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">No album generated yet.</p>
    </section>
  {:else}
    <p class="text-sm mt-2" style="color: var(--color-muted)">
      {localOrder.length} pages · drag to reorder · click a page to open the full review
    </p>
    <p class="text-sm mt-1">
      <a class="btn-ghost" href={`/projects/${data.project.id}/album/review`}>← back to full review</a>
    </p>

    <div class="grid grid-cols-4 gap-3 mt-4">
      {#each localOrder as page, idx (page.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
          class="relative cursor-grab"
          style="
            opacity: {draggingId === page.id ? 0.4 : 1};
            outline: {overIdx === idx ? '2px dashed var(--color-fg)' : 'none'};
            outline-offset: 4px;
          "
          draggable="true"
          ondragstart={(e) => onDragStart(e, page.id)}
          ondragover={(e) => onDragOver(e, idx)}
          ondrop={(e) => onDrop(e, idx)}
          ondragend={onDragEnd}
          onclick={() => openInReview(page.id)}
          title="Page {idx + 1}{page.title ? ` · ${page.title}` : ''} · drag to move, click to open"
        >
          <PageThumb
            templateId={page.template_id}
            slots={data.slotsByPage.get(page.id) ?? []}
            width={220}
          />
          <p class="text-xs text-center mt-1" style="color: var(--color-muted)">
            {idx + 1}{page.title ? ` · ${page.title}` : ''}
          </p>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Create the calendar parallel** at `src/routes/projects/[id]/calendar/sorter/+page.ts` + `+page.svelte`

The calendar version is the same shape but uses `'calendar'` kind and probably grid-cols-3 (calendar is 12 pages — 4×3 grid is natural).

`+page.ts` is identical except `'calendar'` instead of `'album'`. `+page.svelte` is identical except labels and 3-column grid. (Detail: calendar pages have `title` set to 'YYYY-MM' from the assembler; show a readable month label using the same `monthLabel` helper as the review page.)

- [ ] **Step 4: Add "Sorter" links to the review routes**

In `src/routes/projects/[id]/album/review/+page.svelte`, near the top (after the "X pages · click any photo to swap" line), add:

```svelte
    <p class="text-sm">
      <a class="btn-ghost" href={`/projects/${data.project.id}/album/sorter`}>open sorter view →</a>
    </p>
```

Same in calendar review with `/calendar/sorter`.

- [ ] **Step 5: Verify build**

```bash
npm run build && npm run check
```

Both must pass.

- [ ] **Step 6: Commit + push**

```bash
git add -A
git commit -m "Sorter view: thumbnail grid with drag-to-reorder (album + calendar)"
git push origin main
```

---

## Task 3: README + close-out + tag

- [ ] **Step 1: Update `README.md` Status section**

```markdown
## Status

**Phase 1 (Foundation) — complete.** Index folder → SQLite with thumbnails + EXIF.

**Phase 2a (CV pipeline) — complete.** Blur + face detection + pHash dedup.

**Phase 2b (Semantic CV) — complete.** OpenCLIP embeddings + scene tags + SFace + exposure.

**Phase 3a (Selection) — complete.** Aggregate scoring + album/calendar selection.

**Phase 3b (Layout + Review) — complete.** Auto-composed pages + popup picker.

**Phase 3c (Review power) — complete.** Per-page template dropdown + reorder + delete.

**Phase 3e (Sorter view) — complete.** Thumbnail-grid sorter view with drag-to-reorder for both album and calendar. Up/down arrows from Phase 3c still work for fine adjustments.

Phase 3d (slot transforms + auto-position) and Phase 4 (PDF export + LLM captions) are planned but not yet implemented.

See `docs/superpowers/specs/2026-05-14-family-album-builder-design.md` for the design.
```

(Phase 3e is intentionally listed before 3d; 3e is shipping first since it's smaller and addresses the immediate UX gap. 3d is still on the roadmap.)

- [ ] **Step 2: Verify plan in repo**

```bash
ls docs/superpowers/plans/ | grep phase-3e
```

If `2026-05-16-family-album-phase-3e-sorter.md` isn't there, copy from `slop-ideas`.

- [ ] **Step 3: Final commit + tag + push**

```bash
git add README.md docs/superpowers/plans/
git commit -m "Phase 3e close-out: README updated"
git tag phase-3e-sorter
git push origin main
git push origin phase-3e-sorter
```

---

## Phase 3e Definition of Done

- [ ] Sorter view at `/projects/[id]/album/sorter` shows all pages as thumbnails in a 4-col grid.
- [ ] Calendar sorter at `/projects/[id]/calendar/sorter` shows 12 pages in a 3-col grid.
- [ ] Dragging a thumbnail and dropping on another reorders the pages in DB. `index_in_book` updates atomically; selection updated_at bumps.
- [ ] Review pages get a "open sorter view →" link near the top.
- [ ] Sorter pages get a "← back to full review" link near the top.
- [ ] Up/down arrows from Phase 3c still work in the full review.
- [ ] All existing tests pass.

---

## Out of Phase 3e

- Touch / mobile drag gestures — **Phase 4 if mobile target**
- Multi-select drag — **Phase 4 if power-user demand**
- "Jump to page in review" deep-link — **Phase 4 if useful** (would require anchor IDs on each section + scroll-to behavior)
- Drag between album and calendar — never (different selections)
