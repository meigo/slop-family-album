# Family Album & Calendar Builder — Phase 3c (Review Power Features) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two control affordances that turn Phase 3b's review UI from "auto-laid-out, photo-swappable" into "user-fully-in-charge": **change the layout** of any page from a dropdown (single / pair / trio / quad / six / etc., 11 templates total) and **reorder pages** within the album via up/down arrows. The user can now restructure as well as recompose.

**Scope:** Slot transform (drag-to-reposition / scroll-to-zoom inside a slot) is intentionally NOT in 3c — that's its own implementation lift and a separate phase (3d). 3c is template / order changes, which are clean DB ops.

**Architecture:** No schema changes. Adds 7 new template definitions (3 already in 3b → 11 total), a `PageControls` Svelte component (template dropdown + up/down arrows + delete button), and two DB helper sets (template swap + page reorder). The template swap re-creates slot rows, preserving first N photos. Reorder swaps `index_in_book` between adjacent pages.

**Tech Stack additions:** None.

**Spec reference:** `slop-ideas/docs/superpowers/specs/2026-05-14-family-album-builder-design.md` (Layout Engine section, expanded).

**Working directory:** All tasks run from `/Users/meigo/Projects/slop/slop-family-album/`.

**Phase 3c NOT in scope** (deferred to 3d / 4):
- Slot transform (drag-to-reposition, scroll-to-zoom) — **Phase 3d**
- Page deletion is in scope (clean addition for "drop this page entirely")
- Page insertion (add a blank page between others) — **Phase 3d**
- Per-photo brightness/contrast tweaks — **Phase 3d**
- PDF export — **Phase 4**

---

## File Structure (Phase 3c additions)

```
slop-family-album/
  src/lib/
    db/index.ts                              # add page reorder + template swap helpers
    layout/templates.ts                      # add 7 more templates
    components/
      PageControls.svelte                    # NEW — template dropdown + up/down + delete
  src/routes/projects/[id]/album/review/+page.svelte
  src/routes/projects/[id]/calendar/review/+page.svelte
                                             # MODIFIED — render PageControls per page
```

---

## Phase 3C.1 — Templates

### Task 1: Add 7 new templates

- [ ] **Step 1: Replace `src/lib/layout/templates.ts`** (preserve the 4 existing album templates + cal-month; add the new ones)

```ts
/**
 * Layout template definitions. Each template specifies:
 * - id: short string used as page.template_id
 * - slot_count: how many photos it places
 * - slots: array of {x, y, w, h} in unit-square coordinates (0..1)
 * - aspect: page aspect ratio
 *
 * Phase 3c expands from 4 album templates to 10. cal-month unchanged.
 */

export interface SlotLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Template {
  id: string;
  slot_count: number;
  slots: SlotLayout[];
  aspect: 'square' | 'landscape';
  /** Human-readable label for the template dropdown. */
  label: string;
}

export const TEMPLATES: Record<string, Template> = {
  'hero-1': {
    id: 'hero-1',
    slot_count: 1,
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    aspect: 'square',
    label: '1 photo (full)',
  },
  'pair-h': {
    id: 'pair-h',
    slot_count: 2,
    slots: [
      { x: 0,   y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
    aspect: 'square',
    label: '2 photos (side by side)',
  },
  'pair-v': {
    id: 'pair-v',
    slot_count: 2,
    slots: [
      { x: 0, y: 0,   w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
    aspect: 'square',
    label: '2 photos (stacked)',
  },
  'pair-asym-h': {
    id: 'pair-asym-h',
    slot_count: 2,
    slots: [
      { x: 0,   y: 0, w: 0.66, h: 1 },
      { x: 0.66, y: 0, w: 0.34, h: 1 },
    ],
    aspect: 'square',
    label: '2 photos (hero + small, side)',
  },
  'trio-asym': {
    id: 'trio-asym',
    slot_count: 3,
    slots: [
      { x: 0,    y: 0,    w: 0.66, h: 1 },
      { x: 0.66, y: 0,    w: 0.34, h: 0.5 },
      { x: 0.66, y: 0.5,  w: 0.34, h: 0.5 },
    ],
    aspect: 'square',
    label: '3 photos (hero + 2 stacked)',
  },
  'trio-h': {
    id: 'trio-h',
    slot_count: 3,
    slots: [
      { x: 0,     y: 0, w: 0.333, h: 1 },
      { x: 0.333, y: 0, w: 0.334, h: 1 },
      { x: 0.667, y: 0, w: 0.333, h: 1 },
    ],
    aspect: 'square',
    label: '3 photos (vertical strips)',
  },
  'trio-v': {
    id: 'trio-v',
    slot_count: 3,
    slots: [
      { x: 0, y: 0,     w: 1, h: 0.333 },
      { x: 0, y: 0.333, w: 1, h: 0.334 },
      { x: 0, y: 0.667, w: 1, h: 0.333 },
    ],
    aspect: 'square',
    label: '3 photos (horizontal strips)',
  },
  'quad-grid': {
    id: 'quad-grid',
    slot_count: 4,
    slots: [
      { x: 0,   y: 0,   w: 0.5, h: 0.5 },
      { x: 0.5, y: 0,   w: 0.5, h: 0.5 },
      { x: 0,   y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
    aspect: 'square',
    label: '4 photos (2×2 grid)',
  },
  'quad-asym': {
    id: 'quad-asym',
    slot_count: 4,
    // Big photo top-left, 3 smaller around.
    slots: [
      { x: 0,    y: 0,    w: 0.66, h: 0.66 },  // hero
      { x: 0.66, y: 0,    w: 0.34, h: 0.33 },
      { x: 0.66, y: 0.33, w: 0.34, h: 0.33 },
      { x: 0,    y: 0.66, w: 1,    h: 0.34 },  // bottom strip
    ],
    aspect: 'square',
    label: '4 photos (hero + 3)',
  },
  'six-grid': {
    id: 'six-grid',
    slot_count: 6,
    slots: [
      { x: 0,     y: 0,     w: 0.333, h: 0.5 },
      { x: 0.333, y: 0,     w: 0.334, h: 0.5 },
      { x: 0.667, y: 0,     w: 0.333, h: 0.5 },
      { x: 0,     y: 0.5,   w: 0.333, h: 0.5 },
      { x: 0.333, y: 0.5,   w: 0.334, h: 0.5 },
      { x: 0.667, y: 0.5,   w: 0.333, h: 0.5 },
    ],
    aspect: 'square',
    label: '6 photos (3×2 grid)',
  },
  'cal-month': {
    id: 'cal-month',
    slot_count: 1,
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    aspect: 'landscape',
    label: '1 photo (calendar month)',
  },
};

/**
 * Templates compatible with album pages (aspect: square). Used to
 * populate the template-swap dropdown for album pages.
 */
export function albumTemplates(): Template[] {
  return Object.values(TEMPLATES).filter((t) => t.aspect === 'square');
}

/**
 * Templates compatible with calendar pages (aspect: landscape). Only
 * one for now; here for symmetry with albumTemplates() and to keep the
 * dropdown future-proof.
 */
export function calendarTemplates(): Template[] {
  return Object.values(TEMPLATES).filter((t) => t.aspect === 'landscape');
}

export function getTemplate(id: string): Template {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
```

- [ ] **Step 2: Build verification**

```bash
npm run build && npm run check
```

Both must pass. (Existing `pickAlbumTemplate` still only references the 4 original ids, so it works unchanged. Template swap dropdown will surface the rest.)

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/layout/templates.ts
git commit -m "Layout: expand to 10 album templates + add labels"
git push origin main
```

---

## Phase 3C.2 — DB helpers for reorder + swap

### Task 2: Page reorder + template swap helpers

- [ ] **Step 1: Extend `src/lib/db/index.ts`** (append at end)

```ts
// ---- Page operations (Phase 3c) ----

/**
 * Move a page up or down in its selection (swap index_in_book with the
 * adjacent page). No-op at the boundaries. Direction 'up' decreases
 * index; 'down' increases.
 */
export async function reorderPage(pageId: number, direction: 'up' | 'down'): Promise<void> {
  const d = await db();
  const rows = await d.select<{ id: number; selection_id: number; index_in_book: number }[]>(
    'SELECT id, selection_id, index_in_book FROM page WHERE id = ?', [pageId]
  );
  if (rows.length === 0) return;
  const page = rows[0];
  const otherIndex = direction === 'up' ? page.index_in_book - 1 : page.index_in_book + 1;
  if (otherIndex < 0) return;
  const others = await d.select<{ id: number; index_in_book: number }[]>(
    'SELECT id, index_in_book FROM page WHERE selection_id = ? AND index_in_book = ?',
    [page.selection_id, otherIndex]
  );
  if (others.length === 0) return;
  // Swap via a sentinel value to avoid the UNIQUE-on-(selection, index)
  // ambiguity if such a constraint ever exists. Currently there's no
  // unique constraint on (selection_id, index_in_book), so a direct
  // swap is fine — but the sentinel pattern is robust regardless.
  await d.execute('UPDATE page SET index_in_book = -1 WHERE id = ?', [page.id]);
  await d.execute('UPDATE page SET index_in_book = ? WHERE id = ?', [page.index_in_book, others[0].id]);
  await d.execute('UPDATE page SET index_in_book = ? WHERE id = ?', [otherIndex, page.id]);
}

/**
 * Swap the template of a page. Preserves first min(old, new) photos;
 * drops excess if shrinking; leaves new slots empty if growing. The
 * caller is responsible for ensuring the new template is compatible
 * with the page's aspect (album vs calendar).
 */
export async function updatePageTemplate(pageId: number, newTemplateId: string, newSlotCount: number): Promise<void> {
  const d = await db();
  // Snapshot existing slots in slot_index order.
  const oldSlots = await d.select<{ slot_index: number; photo_id: number | null }[]>(
    'SELECT slot_index, photo_id FROM page_slot WHERE page_id = ? ORDER BY slot_index ASC',
    [pageId]
  );
  // Wipe and recreate.
  await d.execute('DELETE FROM page_slot WHERE page_id = ?', [pageId]);
  await d.execute('UPDATE page SET template_id = ? WHERE id = ?', [newTemplateId, pageId]);
  for (let i = 0; i < newSlotCount; i++) {
    const photoId = oldSlots[i]?.photo_id ?? null;
    await d.execute(
      'INSERT INTO page_slot (page_id, slot_index, photo_id) VALUES (?, ?, ?)',
      [pageId, i, photoId]
    );
  }
}

/**
 * Delete a page and re-densify the remaining pages' index_in_book values
 * so the sequence stays 0, 1, 2, ... without gaps.
 */
export async function deletePage(pageId: number): Promise<void> {
  const d = await db();
  const rows = await d.select<{ id: number; selection_id: number; index_in_book: number }[]>(
    'SELECT id, selection_id, index_in_book FROM page WHERE id = ?', [pageId]
  );
  if (rows.length === 0) return;
  const { selection_id, index_in_book } = rows[0];
  await d.execute('DELETE FROM page WHERE id = ?', [pageId]);
  // Decrement index_in_book for all pages that were below the deleted one.
  await d.execute(
    'UPDATE page SET index_in_book = index_in_book - 1 WHERE selection_id = ? AND index_in_book > ?',
    [selection_id, index_in_book]
  );
}
```

- [ ] **Step 2: Build verification**

```bash
npm run build && npm run check
```

Both must pass.

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/db/index.ts
git commit -m "DB: page reorder + template swap + delete helpers"
git push origin main
```

---

## Phase 3C.3 — UI

### Task 3: PageControls component

- [ ] **Step 1: Create `src/lib/components/PageControls.svelte`**

```svelte
<script lang="ts">
  import { albumTemplates, calendarTemplates, type Template } from '$lib/layout/templates';
  import { reorderPage, updatePageTemplate, deletePage } from '$lib/db';
  import { invalidateAll } from '$app/navigation';
  import { ArrowUp, ArrowDown, Trash2 } from 'lucide-svelte';

  interface Props {
    pageId: number;
    currentTemplateId: string;
    kind: 'album' | 'calendar';
    isFirst: boolean;
    isLast: boolean;
  }
  let { pageId, currentTemplateId, kind, isFirst, isLast }: Props = $props();

  let busy = $state(false);

  let templates = $derived<Template[]>(kind === 'album' ? albumTemplates() : calendarTemplates());

  async function changeTemplate(e: Event) {
    const newId = (e.target as HTMLSelectElement).value;
    if (newId === currentTemplateId) return;
    const t = templates.find((x) => x.id === newId);
    if (!t) return;
    busy = true;
    try {
      await updatePageTemplate(pageId, t.id, t.slot_count);
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  async function moveUp() {
    busy = true;
    try {
      await reorderPage(pageId, 'up');
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  async function moveDown() {
    busy = true;
    try {
      await reorderPage(pageId, 'down');
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!confirm('Delete this page?')) return;
    busy = true;
    try {
      await deletePage(pageId);
      await invalidateAll();
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-wrap items-center gap-2 text-sm">
  <select
    class="input-base"
    style="width: auto; padding: 0.25rem 0.5rem;"
    value={currentTemplateId}
    onchange={changeTemplate}
    disabled={busy}
    aria-label="Page layout"
  >
    {#each templates as t}
      <option value={t.id}>{t.label}</option>
    {/each}
  </select>

  <button
    type="button"
    class="btn-ghost"
    onclick={moveUp}
    disabled={busy || isFirst}
    title="Move page up"
    aria-label="Move page up"
  >
    <ArrowUp size={16} />
  </button>
  <button
    type="button"
    class="btn-ghost"
    onclick={moveDown}
    disabled={busy || isLast}
    title="Move page down"
    aria-label="Move page down"
  >
    <ArrowDown size={16} />
  </button>
  <button
    type="button"
    class="btn-ghost"
    onclick={remove}
    disabled={busy}
    title="Delete this page"
    aria-label="Delete page"
    style="color: var(--color-danger);"
  >
    <Trash2 size={16} />
  </button>
</div>
```

- [ ] **Step 2: Build verification**

```bash
npm run build && npm run check
```

Both must pass. The component imports from db helpers added in Task 2 and templates from Task 1.

### Task 4: Wire PageControls into review routes

- [ ] **Step 1: Update `src/routes/projects/[id]/album/review/+page.svelte`**

Find the existing per-page `<section>` block that contains the `<h2>` and `<PageView>`. Replace its content so the header row holds page number + label + `PageControls`, and the body is the `PageView`:

```svelte
<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
  import PageControls from '$lib/components/PageControls.svelte';
  import { invalidateAll } from '$app/navigation';
  import { updateSlotPhoto } from '$lib/db';

  let { data } = $props();

  let pickerOpen = $state<null | { pageId: number; slotIndex: number; currentPhotoId: number | null }>(null);

  function openPicker(pageId: number, slotIndex: number) {
    const slots = data.slotsByPage.get(pageId) ?? [];
    const slot = slots.find((s) => s.slot_index === slotIndex);
    pickerOpen = { pageId, slotIndex, currentPhotoId: slot?.photo_id ?? null };
  }

  async function pickPhoto(photoId: number) {
    if (!pickerOpen) return;
    await updateSlotPhoto(pickerOpen.pageId, pickerOpen.slotIndex, photoId);
    pickerOpen = null;
    await invalidateAll();
  }
</script>

<div class="container-page" style="max-width: 1000px;">
  <PageHeader backHref={`/projects/${data.project.id}`}>
    <h1 class="text-xl font-medium">{data.project.name} — album review</h1>
  </PageHeader>

  {#if !data.selection || data.pages.length === 0}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">
        No album generated yet. Return to the dashboard and click "Generate album".
      </p>
    </section>
  {:else}
    <p class="text-sm mt-2" style="color: var(--color-muted)">
      {data.pages.length} pages · click any photo to swap, use the dropdown to change layout
    </p>

    <div class="flex flex-col gap-6 mt-4">
      {#each data.pages as page, idx}
        <section>
          <div class="flex items-center justify-between gap-2 mb-2">
            <h2 class="text-sm font-medium" style="color: var(--color-muted)">
              Page {idx + 1}{page.title ? ` · ${page.title}` : ''}
            </h2>
            <PageControls
              pageId={page.id}
              currentTemplateId={page.template_id}
              kind="album"
              isFirst={idx === 0}
              isLast={idx === data.pages.length - 1}
            />
          </div>
          <PageView
            templateId={page.template_id}
            slots={data.slotsByPage.get(page.id) ?? []}
            onSlotClick={(slotIndex) => openPicker(page.id, slotIndex)}
          />
        </section>
      {/each}
    </div>
  {/if}

  {#if pickerOpen}
    <PhotoPicker
      projectId={data.project.id}
      kind="album"
      currentPhotoId={pickerOpen.currentPhotoId}
      onPick={pickPhoto}
      onClose={() => pickerOpen = null}
    />
  {/if}
</div>
```

- [ ] **Step 2: Update `src/routes/projects/[id]/calendar/review/+page.svelte`**

Add the same `PageControls` row to each page section. Calendar pages are in a 2-col grid so the header layout differs slightly:

```svelte
<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
  import PageControls from '$lib/components/PageControls.svelte';
  import { invalidateAll } from '$app/navigation';
  import { updateSlotPhoto } from '$lib/db';

  let { data } = $props();

  let pickerOpen = $state<null | { pageId: number; slotIndex: number; bucketKey: string; currentPhotoId: number | null }>(null);

  function monthLabel(bucketKey: string | null): string {
    if (!bucketKey) return '';
    const d = new Date(bucketKey + '-15T12:00:00');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }

  function openPicker(pageId: number, slotIndex: number, bucketKey: string) {
    const slots = data.slotsByPage.get(pageId) ?? [];
    const slot = slots.find((s) => s.slot_index === slotIndex);
    pickerOpen = { pageId, slotIndex, bucketKey, currentPhotoId: slot?.photo_id ?? null };
  }

  async function pickPhoto(photoId: number) {
    if (!pickerOpen) return;
    await updateSlotPhoto(pickerOpen.pageId, pickerOpen.slotIndex, photoId);
    pickerOpen = null;
    await invalidateAll();
  }
</script>

<div class="container-page" style="max-width: 1000px;">
  <PageHeader backHref={`/projects/${data.project.id}`}>
    <h1 class="text-xl font-medium">{data.project.name} — calendar review</h1>
  </PageHeader>

  {#if !data.selection || data.pages.length === 0}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">
        No calendar generated yet. Return to the dashboard and click "Generate calendar".
      </p>
    </section>
  {:else}
    <p class="text-sm mt-2" style="color: var(--color-muted)">
      {data.pages.length} pages · click any photo to swap, use the dropdown to change layout
    </p>

    <div class="grid grid-cols-2 gap-4 mt-4">
      {#each data.pages as page, idx}
        <section>
          <h2 class="text-sm font-medium mb-1" style="color: var(--color-muted)">
            {monthLabel(page.title)}
          </h2>
          <PageView
            templateId={page.template_id}
            slots={data.slotsByPage.get(page.id) ?? []}
            onSlotClick={(slotIndex) => openPicker(page.id, slotIndex, page.title ?? '')}
          />
          <div class="mt-1">
            <PageControls
              pageId={page.id}
              currentTemplateId={page.template_id}
              kind="calendar"
              isFirst={idx === 0}
              isLast={idx === data.pages.length - 1}
            />
          </div>
        </section>
      {/each}
    </div>
  {/if}

  {#if pickerOpen}
    <PhotoPicker
      projectId={data.project.id}
      kind="calendar"
      sourceYear={data.project.calendar_year - 1}
      bucketKey={pickerOpen.bucketKey}
      currentPhotoId={pickerOpen.currentPhotoId}
      onPick={pickPhoto}
      onClose={() => pickerOpen = null}
    />
  {/if}
</div>
```

- [ ] **Step 3: Build verification**

```bash
npm run build && npm run check
```

Both must pass.

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "Review: PageControls component + per-page template dropdown + reorder + delete"
git push origin main
```

---

## Phase 3C.4 — Close-out

### Task 5: README + tag

- [ ] **Step 1: Update `README.md` Status section**

Replace the existing Status section. Preserve other sections.

```markdown
## Status

**Phase 1 (Foundation) — complete.** Index folder → SQLite with thumbnails + EXIF, library grid.

**Phase 2a (CV pipeline) — complete.** Blur + face detection + perceptual hash; pHash duplicate groups.

**Phase 2b (Semantic CV) — complete.** OpenCLIP embeddings, scene tags, SFace face embeddings, exposure scoring. Face clustering retained in code but de-emphasized in v1 UX.

**Phase 3a (Selection) — complete.** Aggregate scoring + album/calendar selection algorithms. Year filter, per-month cap, adjacent-month fallback.

**Phase 3b (Layout + Review) — complete.** Auto-composed pages + visual review UI with popup picker. Click any slot to swap; scope and sort filters in the picker.

**Phase 3c (Review power) — complete.** Per-page template dropdown (10 album templates: single / pairs / trios / quads / six-grid), page reorder via up/down arrows, page delete. The user can fully restructure the auto-generated album.

Phase 3d (slot drag/zoom + per-photo crop adjustment) and Phase 4 (PDF export + LLM captions) are planned but not yet implemented.

See `docs/superpowers/specs/2026-05-14-family-album-builder-design.md` for the design.
```

- [ ] **Step 2: Verify plan present**

```bash
ls docs/superpowers/plans/
```

If `2026-05-16-family-album-phase-3c-review-power.md` isn't already copied from slop-ideas, copy it.

- [ ] **Step 3: Final commit + tag + push**

```bash
git add README.md docs/superpowers/plans/
git commit -m "Phase 3c close-out: README, plan copy"
git tag phase-3c-review-power
git push origin main
git push origin phase-3c-review-power
```

---

## Phase 3c Definition of Done

- [ ] 10 album templates available in the dropdown.
- [ ] Changing a page's template via the dropdown immediately re-renders that page with the new layout.
- [ ] First N photos are preserved across template changes; extra slots stay empty (clickable to fill).
- [ ] Up/down arrows on each page move it within the album. Disabled at boundaries.
- [ ] Delete button removes a page and re-densifies the remaining indices.
- [ ] All actions invalidate and re-render the page list.
- [ ] All existing tests still pass.

---

## Out of Phase 3c

- Slot drag-to-reposition / scroll-to-zoom — **Phase 3d**
- Page insertion (add blank page) — **Phase 3d**
- Per-photo exposure/contrast adjustment — **Phase 3d**
- PDF export — **Phase 4**
- LLM captions — **Phase 4**
- Drag-to-reorder pages (alternative to up/down arrows) — **Phase 3d if user demand**
