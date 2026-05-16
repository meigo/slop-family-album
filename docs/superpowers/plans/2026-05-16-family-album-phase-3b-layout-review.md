# Family Album & Calendar Builder — Phase 3b (Layout + Review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the ordered selection lists from Phase 3a into a **fully paginated, visual review UI**. Every album/calendar page is auto-composed using layout templates + the selection. The user scrolls through pages and swaps any photo they don't like via a popup picker. End state: user can go from "Generate album" to a satisfied page sequence in one quick manual pass, then move on. **No people-naming step in the user-facing flow.**

This phase is shaped by the post-Phase-3a rethink: face detection turned out to be over-engineered for our actual need, and the user's workflow is fundamentally "auto-fill → manual swap" rather than "tag people → trust the algorithm." Phase 3b builds for that workflow.

**Architecture:** Migration 006 adds `page` + `page_slot` tables. Generate Album/Calendar now runs a two-step pipeline: existing selection algorithm produces `selected_photo` rows (unchanged), then a new **page-assembly** module turns those rows into `page` + `page_slot` rows based on per-bucket photo counts and a deterministic template picker. The review route renders pages full-size; each slot is clickable, opening a popup `PhotoPicker` showing candidate photos for that bucket sortable by score, chronology, or **visual similarity** (CLIP embedding cosine — finally giving the unused `image_embedding` table real work). Clicking a candidate updates the `page_slot.photo_id` and re-renders.

**Tech Stack additions:** None — pure TS/Svelte over existing SQLite/Tauri stack. No Python sidecar changes.

**Spec reference:** `slop-ideas/docs/superpowers/specs/2026-05-14-family-album-builder-design.md` (Layout Engine section), with a deliberate departure from the original "8 templates + people-balance constraint" complexity. v1 ships **4 album templates + 1 calendar template** and skips the constraint-based people-balance pass.

**Working directory:** All tasks run from `/Users/meigo/Projects/slop/slop-family-album/`.

**Phase 3b NOT in scope** (deferred):
- Drag-to-reposition / scroll-to-zoom inside a slot (transform UI) — **Phase 3c**
- Per-page template override picker — **Phase 3c**
- Month divider pages, year cover page — **Phase 3c or 4**
- Calendar date grid below the photo (the actual "calendar" part of the calendar page) — **Phase 4** (it's a PDF-rendering concern)
- More layout templates (six-grid, pano-band, etc.) — **Phase 3c if needed**
- People page resurrection — held out indefinitely
- PDF export — **Phase 4**
- LLM captions — **Phase 4**

---

## File Structure (Phase 3b additions)

```
slop-family-album/
  src-tauri/migrations/
    006_pages.sql                                    # NEW
  src/lib/
    db/
      index.ts                                       # add page + page_slot helpers
      types.ts                                       # add PageRow, PageSlotRow types
    layout/
      templates.ts                                   # NEW — template definitions
      picker.ts                                      # NEW — deterministic template picker
      assembly.ts                                    # NEW — selection → pages → slots
    components/
      PageView.svelte                                # NEW — renders a single page given template + photos
      PhotoPicker.svelte                             # NEW — modal popup for slot swap
  src/routes/projects/[id]/
    +page.svelte                                     # MODIFIED — Generate buttons now navigate to review
    album/review/                                    # NEW route
      +page.ts
      +page.svelte
    calendar/review/                                 # NEW route
      +page.ts
      +page.svelte
```

---

## Phase 3B.1 — Schema

### Task 1: Migration 006_pages.sql

- [ ] **Step 1: Create `src-tauri/migrations/006_pages.sql`**

```sql
-- One row per page in the album/calendar. Pages are ordered by
-- index_in_book within their selection. Re-generating a selection
-- creates a fresh set of pages (ON DELETE CASCADE from selection
-- handles cleanup of stale pages).
CREATE TABLE page (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  selection_id INTEGER NOT NULL REFERENCES selection(id) ON DELETE CASCADE,
  index_in_book INTEGER NOT NULL,
  template_id TEXT NOT NULL,
  title TEXT,
  body TEXT
);

CREATE INDEX idx_page_selection ON page (selection_id, index_in_book);

-- One row per photo slot within a page. slot_index 0-based.
-- photo_id is nullable so an empty slot (e.g., calendar fallback that
-- failed) can be persisted. transform_json reserved for Phase 3c
-- (drag-to-reposition / scroll-to-zoom).
CREATE TABLE page_slot (
  page_id INTEGER NOT NULL REFERENCES page(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  photo_id INTEGER REFERENCES photo(id) ON DELETE SET NULL,
  transform_json TEXT,
  PRIMARY KEY (page_id, slot_index)
);
```

- [ ] **Step 2: Register migration 006 in `src-tauri/src/lib.rs`**

Append to the existing `migrations()` vec:

```rust
tauri_plugin_sql::Migration {
  version: 6,
  description: "pages_and_page_slots",
  sql: include_str!("../migrations/006_pages.sql"),
  kind: tauri_plugin_sql::MigrationKind::Up,
},
```

- [ ] **Step 3: Build verification**

```bash
cd src-tauri && cargo check && cd ..
npm run build && npm run check
```

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "Migration 006: page + page_slot tables"
git push origin main
```

### Task 2: DB helpers for pages

- [ ] **Step 1: Extend `src/lib/db/types.ts`**

Append:

```ts
export interface PageRow {
  id: number;
  selection_id: number;
  index_in_book: number;
  template_id: string;
  title: string | null;
  body: string | null;
}

export interface PageInsert {
  selection_id: number;
  index_in_book: number;
  template_id: string;
  title?: string | null;
  body?: string | null;
}

export interface PageSlotRow {
  page_id: number;
  slot_index: number;
  photo_id: number | null;
  transform_json: string | null;
}

export interface PageSlotInsert {
  page_id: number;
  slot_index: number;
  photo_id: number | null;
  transform_json?: string | null;
}
```

- [ ] **Step 2: Extend `src/lib/db/index.ts`**

Update the type imports to include `PageRow`, `PageInsert`, `PageSlotInsert` (used directly in this file). Append these functions:

```ts
export async function insertPage(p: PageInsert): Promise<number> {
  const d = await db();
  const r = await d.execute(
    'INSERT INTO page (selection_id, index_in_book, template_id, title, body) VALUES (?, ?, ?, ?, ?)',
    [p.selection_id, p.index_in_book, p.template_id, p.title ?? null, p.body ?? null]
  );
  return r.lastInsertId as number;
}

export async function insertPageSlot(s: PageSlotInsert): Promise<void> {
  const d = await db();
  await d.execute(
    'INSERT INTO page_slot (page_id, slot_index, photo_id, transform_json) VALUES (?, ?, ?, ?)',
    [s.page_id, s.slot_index, s.photo_id, s.transform_json ?? null]
  );
}

export async function updateSlotPhoto(pageId: number, slotIndex: number, photoId: number): Promise<void> {
  const d = await db();
  await d.execute(
    'UPDATE page_slot SET photo_id = ? WHERE page_id = ? AND slot_index = ?',
    [photoId, pageId, slotIndex]
  );
}

export async function listPagesForSelection(selectionId: number): Promise<PageRow[]> {
  const d = await db();
  return d.select<PageRow[]>(
    'SELECT * FROM page WHERE selection_id = ? ORDER BY index_in_book ASC',
    [selectionId]
  );
}

// Returns slots for a set of page IDs, joined with photo path + thumb.
// Used by the review route to render all pages in one shot.
export async function listSlotsForPages(pageIds: number[]): Promise<Array<PageSlotRow & { path: string | null; thumb_path: string | null; embedding: string | null }>> {
  if (pageIds.length === 0) return [];
  const d = await db();
  const placeholders = pageIds.map(() => '?').join(',');
  return d.select<Array<PageSlotRow & { path: string | null; thumb_path: string | null; embedding: string | null }>>(
    `SELECT ps.*, p.path, p.thumb_path, ie.vector as embedding
     FROM page_slot ps
     LEFT JOIN photo p ON p.id = ps.photo_id
     LEFT JOIN image_embedding ie ON ie.photo_id = ps.photo_id
     WHERE ps.page_id IN (${placeholders})
     ORDER BY ps.page_id ASC, ps.slot_index ASC`,
    pageIds
  );
}

// Photos eligible for a given bucket key — used by PhotoPicker to show
// alternatives. For album: bucket_key = 'YYYY-MM-DD' → photos taken
// that day. For calendar: bucket_key = 'YYYY-MM' (target year+month)
// → photos taken in the same calendar month of the source year
// (calendar_year - 1). Photos already used in the current selection
// are NOT excluded — the user may want to move a photo from one slot
// to another (in v1, the swap just leaves a duplicate; Phase 3c can
// add "move" semantics if needed).
export async function listCandidatesForBucket(args: {
  projectId: number;
  bucketKey: string;
  kind: 'album' | 'calendar';
  sourceYear?: number;          // required when kind === 'calendar'
}): Promise<Array<{ id: number; path: string; thumb_path: string | null; taken_at: number | null; score: number | null; embedding: string | null }>> {
  const d = await db();
  if (args.kind === 'album') {
    // bucket_key is 'YYYY-MM-DD'. Match photos whose taken_at falls on that day.
    // Compute day boundaries in UTC. Local TZ slight skew acceptable v1.
    const dayStart = new Date(`${args.bucketKey}T00:00:00`).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return d.select<Array<{ id: number; path: string; thumb_path: string | null; taken_at: number | null; score: number | null; embedding: string | null }>>(
      `SELECT p.id, p.path, p.thumb_path, p.taken_at,
              (SELECT cv.blur FROM cv_score cv WHERE cv.photo_id = p.id) as score,
              (SELECT ie.vector FROM image_embedding ie WHERE ie.photo_id = p.id) as embedding
       FROM photo p
       WHERE p.project_id = ?
         AND p.taken_at IS NOT NULL
         AND p.taken_at >= ?
         AND p.taken_at < ?
       ORDER BY p.taken_at ASC, p.id ASC`,
      [args.projectId, dayStart, dayEnd]
    );
  } else {
    // bucket_key is 'YYYY-MM' (target year). Source month = same month
    // of calendar_year - 1, which we get via args.sourceYear.
    if (args.sourceYear === undefined) throw new Error('sourceYear required for calendar bucket');
    const month = Number(args.bucketKey.slice(5, 7));
    const monthStart = new Date(args.sourceYear, month - 1, 1).getTime();
    const monthEnd = new Date(args.sourceYear, month, 1).getTime();
    return d.select<Array<{ id: number; path: string; thumb_path: string | null; taken_at: number | null; score: number | null; embedding: string | null }>>(
      `SELECT p.id, p.path, p.thumb_path, p.taken_at,
              (SELECT cv.blur FROM cv_score cv WHERE cv.photo_id = p.id) as score,
              (SELECT ie.vector FROM image_embedding ie WHERE ie.photo_id = p.id) as embedding
       FROM photo p
       WHERE p.project_id = ?
         AND p.taken_at IS NOT NULL
         AND p.taken_at >= ?
         AND p.taken_at < ?
       ORDER BY p.taken_at ASC, p.id ASC`,
      [args.projectId, monthStart, monthEnd]
    );
  }
}

export async function clearPagesForSelection(selectionId: number): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM page WHERE selection_id = ?', [selectionId]);
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build && npm run check
```

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "DB module: page + page_slot helpers, candidate query"
git push origin main
```

---

## Phase 3B.2 — Layout Engine

### Task 3: Template definitions

- [ ] **Step 1: Create `src/lib/layout/templates.ts`**

```ts
/**
 * Layout template definitions. Each template specifies:
 * - id: short string ('hero-1', 'pair-h', etc.) used as page.template_id
 * - slot_count: how many photos it places
 * - slots: array of {x, y, w, h} in unit-square coordinates (0..1).
 *   x = left, y = top, w = width, h = height. The page is rendered
 *   in a 1:1 aspect for album, 4:3 for calendar.
 *
 * PageView.svelte renders these by positioning <img> elements absolutely
 * within the page container.
 *
 * v1 ships 4 album templates + 1 calendar template. Phase 3c may add
 * six-grid, pano-band, month-divider if user demand surfaces.
 */

export interface SlotLayout {
  x: number;        // 0-1 left
  y: number;        // 0-1 top
  w: number;        // 0-1 width
  h: number;        // 0-1 height
}

export interface Template {
  id: string;
  slot_count: number;
  slots: SlotLayout[];
  aspect: 'square' | 'landscape';
}

export const TEMPLATES: Record<string, Template> = {
  'hero-1': {
    id: 'hero-1',
    slot_count: 1,
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    aspect: 'square',
  },
  'pair-h': {
    id: 'pair-h',
    slot_count: 2,
    slots: [
      { x: 0,   y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
    aspect: 'square',
  },
  'pair-v': {
    id: 'pair-v',
    slot_count: 2,
    slots: [
      { x: 0, y: 0,   w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
    aspect: 'square',
  },
  'trio-asym': {
    id: 'trio-asym',
    slot_count: 3,
    // Hero left (taller), two stacked right.
    slots: [
      { x: 0,    y: 0,    w: 0.66, h: 1 },
      { x: 0.66, y: 0,    w: 0.34, h: 0.5 },
      { x: 0.66, y: 0.5,  w: 0.34, h: 0.5 },
    ],
    aspect: 'square',
  },
  'cal-month': {
    id: 'cal-month',
    slot_count: 1,
    // Full-bleed photo for v1; the actual date grid is Phase 4 (PDF
    // rendering). Treat the calendar page as a landscape photo card.
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    aspect: 'landscape',
  },
};

export function getTemplate(id: string): Template {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build && npm run check
```

- [ ] **Step 3: Commit**

Stage this commit but **don't push yet** — Task 4 follows immediately.

```bash
git add src/lib/layout/templates.ts
git commit -m "Layout: 5 template definitions (4 album + 1 calendar)"
```

### Task 4: Template picker

- [ ] **Step 1: Create `src/lib/layout/picker.ts`**

```ts
import { TEMPLATES, type Template } from './templates';

/**
 * Choose an album template based on the number of photos in a bucket
 * and (when 2) their combined orientation. v1 deterministic:
 * - 1 photo → hero-1
 * - 2 photos, both portrait → pair-h
 * - 2 photos, both landscape → pair-v
 * - 2 photos, mixed → pair-h (default)
 * - 3 photos → trio-asym
 * - 4+ photos: trio-asym taking top 3, the rest become additional hero-1
 *   pages (handled by the assembly module, not here)
 *
 * Returns the template id for a bucket of size `n` with given
 * orientation array. Caller is responsible for chunking >3 buckets.
 */
export function pickAlbumTemplate(n: number, orientations: Array<'portrait' | 'landscape'>): Template {
  if (n === 1) return TEMPLATES['hero-1'];
  if (n === 2) {
    const allPortrait = orientations.every((o) => o === 'portrait');
    const allLandscape = orientations.every((o) => o === 'landscape');
    if (allLandscape) return TEMPLATES['pair-v'];
    // Mixed or all-portrait → pair-h
    return TEMPLATES['pair-h'];
  }
  if (n >= 3) return TEMPLATES['trio-asym'];
  // n === 0 shouldn't happen (assembly skips empty buckets); fall back to hero-1
  return TEMPLATES['hero-1'];
}

export function pickCalendarTemplate(): Template {
  return TEMPLATES['cal-month'];
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build && npm run check
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/layout/picker.ts
git commit -m "Layout: template picker (deterministic, by count + orientation)"
```

### Task 5: Page assembly

- [ ] **Step 1: Create `src/lib/layout/assembly.ts`**

```ts
import {
  listSelectedPhotos, listPhotos, getProject, getCurrentSelection,
  insertPage, insertPageSlot, clearPagesForSelection,
} from '$lib/db';
import { pickAlbumTemplate, pickCalendarTemplate } from './picker';
import { TEMPLATES } from './templates';

/**
 * Build pages for the current selection of the given kind. Replaces
 * any existing pages for that selection.
 *
 * Album:
 *   1. Iterate selected_photo rows ordered by bucket_key ASC (date).
 *   2. Group by bucket_key (one day → one page if ≤ 3 photos; multiple
 *      pages if more, but per_day_cap = 3 in Phase 3a means we expect
 *      ≤ 3).
 *   3. For each day-bucket, pick a template by count + orientation,
 *      create page + slots.
 *
 * Calendar:
 *   1. For each month bucket (2026-01, 2026-02, ...), create one page
 *      with template 'cal-month'.
 *   2. If bucket has a photo, slot it. If empty, slot is null (the UI
 *      will show an empty slot the user can fill via picker).
 */
export async function assembleAlbumPages(projectId: number): Promise<void> {
  const selection = await getCurrentSelection(projectId, 'album');
  if (!selection) throw new Error(`No current album selection for project ${projectId}`);
  await clearPagesForSelection(selection.id);

  const allPhotos = await listPhotos(projectId);
  const photoById = new Map(allPhotos.map((p) => [p.id, p]));

  const sel = await listSelectedPhotos(selection.id);

  // Group by bucket_key (date).
  const byDay = new Map<string, typeof sel>();
  for (const s of sel) {
    const arr = byDay.get(s.bucket_key) ?? [];
    arr.push(s);
    byDay.set(s.bucket_key, arr);
  }

  let pageIndex = 0;
  // Iterate buckets in date order (sel is already sorted by bucket asc).
  const days = [...byDay.keys()];  // preserves insertion order
  for (const day of days) {
    const dayPhotos = byDay.get(day)!;
    // Determine orientations
    const orientations = dayPhotos.map((sp): 'portrait' | 'landscape' => {
      const ph = photoById.get(sp.photo_id);
      if (!ph || !ph.width || !ph.height) return 'landscape';
      return ph.height >= ph.width ? 'portrait' : 'landscape';
    });
    // If >3 photos, chunk into pages of (3, 1, 1, ...) — trio first,
    // then hero pages for overflow.
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
    // cal-month has 1 slot. Fill with the top-ranked photo for this
    // month, or insert an empty slot if none.
    await insertPageSlot({
      page_id: pageId,
      slot_index: 0,
      photo_id: monthPhotos[0]?.photo_id ?? null,
    });
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build && npm run check
```

- [ ] **Step 3: Commit + push (combine with Tasks 3+4)**

```bash
git add src/lib/layout/assembly.ts
git commit -m "Layout: page assembly (selection → pages → slots)"
git push origin main
```

### Task 6: Hook assembly into Generate buttons

- [ ] **Step 1: Update `src/lib/selection/album.ts` and `calendar.ts`**

These currently end by returning the selection id. We want assembly to run automatically after selection. Two options:

a) Modify the selection algorithms to call assembly at the end.
b) Modify the dashboard handlers to call selection THEN assembly THEN navigate.

Option (b) is cleaner (keeps selection vs assembly as separable concerns). Do that.

- [ ] **Step 2: Update `src/routes/projects/[id]/+page.svelte`**

Find the existing `runGenerateAlbum` and `runGenerateCalendar` handlers. Modify them to call assembly + navigate to the new review routes:

```ts
  import { generateAlbumSelection } from '$lib/selection/album';
  import { generateCalendarSelection } from '$lib/selection/calendar';
  import { assembleAlbumPages, assembleCalendarPages } from '$lib/layout/assembly';
  import { goto } from '$app/navigation';

  let generating = $state<null | 'album' | 'calendar'>(null);

  async function runGenerateAlbum() {
    generating = 'album';
    try {
      await generateAlbumSelection(data.project.id);
      await assembleAlbumPages(data.project.id);
      await goto(`/projects/${data.project.id}/album/review`);
    } finally {
      generating = null;
    }
  }

  async function runGenerateCalendar() {
    generating = 'calendar';
    try {
      await generateCalendarSelection(data.project.id);
      await assembleCalendarPages(data.project.id);
      await goto(`/projects/${data.project.id}/calendar/review`);
    } finally {
      generating = null;
    }
  }
```

The OLD selection list views at `/projects/[id]/selection/[kind]` stay in place (still useful for debugging — show the ordered list with scores and histogram). They're just no longer the primary destination from Generate.

- [ ] **Step 3: Verify build**

```bash
npm run build && npm run check
```

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "Dashboard: Generate buttons now also assemble pages, navigate to review"
git push origin main
```

---

## Phase 3B.3 — Review UI

### Task 7: PageView component + review routes

- [ ] **Step 1: Create `src/lib/components/PageView.svelte`**

Renders a single page given template_id + array of slots (photo per slot).

```svelte
<script lang="ts">
  import { getTemplate, type Template } from '$lib/layout/templates';
  import { convertFileSrc } from '@tauri-apps/api/core';

  interface Slot {
    slot_index: number;
    photo_id: number | null;
    thumb_path: string | null;
  }

  interface Props {
    templateId: string;
    slots: Slot[];
    onSlotClick?: (slotIndex: number) => void;
  }
  let { templateId, slots, onSlotClick }: Props = $props();

  let tpl = $derived<Template>(getTemplate(templateId));
  let aspectRatio = $derived(tpl.aspect === 'square' ? '1 / 1' : '4 / 3');

  // Order slots by slot_index ascending so they match tpl.slots index.
  let orderedSlots = $derived([...slots].sort((a, b) => a.slot_index - b.slot_index));
</script>

<div
  class="relative w-full surface-card p-0 overflow-hidden"
  style="aspect-ratio: {aspectRatio}; border: 1px solid var(--color-line);"
>
  {#each tpl.slots as slotLayout, i}
    {@const slot = orderedSlots[i]}
    <button
      type="button"
      class="absolute"
      style="
        left: {slotLayout.x * 100}%;
        top: {slotLayout.y * 100}%;
        width: {slotLayout.w * 100}%;
        height: {slotLayout.h * 100}%;
        padding: 2px;
        background: none;
        border: none;
        cursor: {onSlotClick ? 'pointer' : 'default'};
      "
      onclick={() => onSlotClick?.(i)}
    >
      <div class="w-full h-full overflow-hidden" style="background: var(--color-line);">
        {#if slot?.thumb_path}
          <img
            src={convertFileSrc(slot.thumb_path)}
            alt=""
            class="w-full h-full object-cover"
            draggable="false"
          />
        {:else}
          <div class="w-full h-full flex items-center justify-center" style="color: var(--color-muted)">
            <span class="text-xs">empty slot</span>
          </div>
        {/if}
      </div>
    </button>
  {/each}
</div>
```

- [ ] **Step 2: Create `src/routes/projects/[id]/album/review/+page.ts`**

```ts
import { getProject, getCurrentSelection, listPagesForSelection, listSlotsForPages } from '$lib/db';
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

- [ ] **Step 3: Create `src/routes/projects/[id]/album/review/+page.svelte`**

```svelte
<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
  import { invalidateAll } from '$app/navigation';
  import { updateSlotPhoto } from '$lib/db';

  let { data } = $props();

  // Open picker state: which page + which slot
  let pickerOpen = $state<null | { pageId: number; slotIndex: number; bucketKey: string; currentPhotoId: number | null }>(null);

  function openPicker(pageId: number, slotIndex: number) {
    const slots = data.slotsByPage.get(pageId) ?? [];
    const slot = slots.find((s) => s.slot_index === slotIndex);
    // For album: page.body field unused; bucket_key comes from the
    // selected_photo row of the page's first slot. We pull it via the
    // page's slots — every slot in an album page belongs to the same day.
    // The loader could expose this more cleanly; for v1, look up via DB
    // by selection + photo.
    // Simpler approach: derive bucket from the photo's taken_at if known,
    // else fall back to all-photos. For Phase 3b v1 we accept "show
    // candidates for the page's first slot's photo's date". If the slot
    // is empty, the picker shows nothing (empty bucket) and the user
    // can re-generate.
    // For simplicity here, store the photo_id only; the PhotoPicker
    // queries by photo's date.
    pickerOpen = {
      pageId,
      slotIndex,
      bucketKey: '',  // PhotoPicker will resolve from currentPhotoId
      currentPhotoId: slot?.photo_id ?? null,
    };
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
      {data.pages.length} pages · click any photo to swap
    </p>

    <div class="flex flex-col gap-6 mt-4">
      {#each data.pages as page, idx}
        <section>
          <h2 class="text-sm font-medium mb-1" style="color: var(--color-muted)">
            Page {idx + 1} · template {page.template_id}
          </h2>
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

- [ ] **Step 4: Create the parallel calendar review route**

`src/routes/projects/[id]/calendar/review/+page.ts`:

```ts
import { getProject, getCurrentSelection, listPagesForSelection, listSlotsForPages } from '$lib/db';
import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export async function load({ params }) {
  const id = Number(params.id);
  const project = await getProject(id);
  if (!project) throw error(404, 'Project not found');
  const selection = await getCurrentSelection(id, 'calendar');
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

`src/routes/projects/[id]/calendar/review/+page.svelte`:

```svelte
<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
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
    pickerOpen = {
      pageId, slotIndex, bucketKey,
      currentPhotoId: slot?.photo_id ?? null,
    };
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
      {data.pages.length} pages · click any photo to swap
    </p>

    <div class="grid grid-cols-2 gap-4 mt-4">
      {#each data.pages as page}
        <section>
          <h2 class="text-sm font-medium mb-1" style="color: var(--color-muted)">
            {monthLabel(page.title)}
          </h2>
          <PageView
            templateId={page.template_id}
            slots={data.slotsByPage.get(page.id) ?? []}
            onSlotClick={(slotIndex) => openPicker(page.id, slotIndex, page.title ?? '')}
          />
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

- [ ] **Step 5: Verify build**

```bash
npm run build && npm run check
```

(Will fail temporarily because PhotoPicker doesn't exist yet — Task 8 creates it. Defer build verification until after Task 8.)

### Task 8: PhotoPicker popup component

- [ ] **Step 1: Create `src/lib/components/PhotoPicker.svelte`**

```svelte
<script lang="ts">
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { listCandidatesForBucket, getPhotoTakenAt } from '$lib/db';
  import { onMount } from 'svelte';

  interface Props {
    projectId: number;
    kind: 'album' | 'calendar';
    bucketKey?: string;       // optional for album (derived from current photo)
    sourceYear?: number;       // required for calendar
    currentPhotoId: number | null;
    onPick: (photoId: number) => void;
    onClose: () => void;
  }
  let { projectId, kind, bucketKey, sourceYear, currentPhotoId, onPick, onClose }: Props = $props();

  type Candidate = {
    id: number;
    path: string;
    thumb_path: string | null;
    taken_at: number | null;
    score: number | null;
    embedding: string | null;
  };
  let candidates = $state<Candidate[]>([]);
  let loading = $state(true);
  let sortMode = $state<'score' | 'time' | 'similarity'>('score');

  // For 'similarity' sort: decode the current photo's embedding once.
  let currentEmbedding = $state<Float32Array | null>(null);

  function decodeB64(b64: string | null): Float32Array | null {
    if (!b64) return null;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  }

  function cosine(a: Float32Array, b: Float32Array): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
    let d = 0;
    for (let i = 0; i < a.length; i++) d += a[i] * b[i];
    return d;
  }

  onMount(async () => {
    let effectiveBucket = bucketKey ?? '';
    // For album with no bucket key passed: derive from current photo's date.
    if (kind === 'album' && (!effectiveBucket || effectiveBucket.length === 0) && currentPhotoId !== null) {
      const taken = await getPhotoTakenAt(currentPhotoId);
      if (taken !== null) {
        const d = new Date(taken);
        const y = d.getFullYear().toString().padStart(4, '0');
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        effectiveBucket = `${y}-${m}-${dd}`;
      }
    }
    candidates = await listCandidatesForBucket({
      projectId, bucketKey: effectiveBucket, kind, sourceYear,
    });
    if (currentPhotoId !== null) {
      const cur = candidates.find((c) => c.id === currentPhotoId);
      if (cur) currentEmbedding = decodeB64(cur.embedding);
    }
    loading = false;
  });

  let sorted = $derived.by(() => {
    if (sortMode === 'time') {
      return [...candidates].sort((a, b) => (a.taken_at ?? 0) - (b.taken_at ?? 0) || a.id - b.id);
    }
    if (sortMode === 'similarity' && currentEmbedding !== null) {
      return [...candidates].sort((a, b) => {
        const va = decodeB64(a.embedding);
        const vb = decodeB64(b.embedding);
        const sa = va ? cosine(va, currentEmbedding!) : -2;
        const sb = vb ? cosine(vb, currentEmbedding!) : -2;
        return sb - sa;
      });
    }
    // default: by 'score' (which we mapped to cv_score.blur in the query)
    return [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id - b.id);
  });

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center"
  style="background: rgba(0, 0, 0, 0.7);"
  onclick={handleBackdrop}
>
  <div class="surface-card relative" style="width: 90vw; max-width: 900px; max-height: 90vh; overflow-y: auto;">
    <div class="flex items-baseline justify-between mb-3">
      <h3 class="text-lg font-medium">Pick a photo</h3>
      <button type="button" class="btn-ghost" onclick={onClose}>Close (Esc)</button>
    </div>

    <div class="flex gap-2 mb-3 text-sm">
      <button
        type="button"
        class={sortMode === 'score' ? 'btn-primary' : 'btn-secondary'}
        onclick={() => sortMode = 'score'}
      >By score</button>
      <button
        type="button"
        class={sortMode === 'time' ? 'btn-primary' : 'btn-secondary'}
        onclick={() => sortMode = 'time'}
      >Chronological</button>
      <button
        type="button"
        class={sortMode === 'similarity' ? 'btn-primary' : 'btn-secondary'}
        onclick={() => sortMode = 'similarity'}
        disabled={currentEmbedding === null}
        title={currentEmbedding === null ? 'No embedding for the current slot photo' : 'Sort by visual similarity to current slot photo'}
      >By similarity</button>
    </div>

    {#if loading}
      <p style="color: var(--color-muted)">Loading candidates…</p>
    {:else if sorted.length === 0}
      <p style="color: var(--color-muted)">No photos available for this bucket.</p>
    {:else}
      <p class="text-sm mb-2" style="color: var(--color-muted)">{sorted.length} candidate{sorted.length === 1 ? '' : 's'}</p>
      <div class="grid grid-cols-4 gap-2">
        {#each sorted as c}
          <button
            type="button"
            class="surface-card p-1 relative"
            style={c.id === currentPhotoId ? 'outline: 2px solid var(--color-fg);' : ''}
            onclick={() => onPick(c.id)}
            title={c.path}
          >
            {#if c.thumb_path}
              <img src={convertFileSrc(c.thumb_path)} alt="" class="w-full aspect-square object-cover rounded" />
            {:else}
              <div class="w-full aspect-square" style="background: var(--color-line)"></div>
            {/if}
            {#if c.id === currentPhotoId}
              <span class="absolute top-1 left-1 text-xs px-1 rounded" style="background: var(--color-fg); color: var(--color-bg)">current</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 2: Add `getPhotoTakenAt` helper to `src/lib/db/index.ts`**

Append:

```ts
export async function getPhotoTakenAt(photoId: number): Promise<number | null> {
  const d = await db();
  const rows = await d.select<{ taken_at: number | null }[]>(
    'SELECT taken_at FROM photo WHERE id = ?', [photoId]
  );
  return rows[0]?.taken_at ?? null;
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build && npm run check
```

Both must pass now (PhotoPicker exists; previous route files import it cleanly).

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "PhotoPicker popup + review routes (album, calendar)"
git push origin main
```

---

## Phase 3B.4 — Close-out

### Task 9: README + tag

- [ ] **Step 1: Update `README.md` Status section**

```markdown
## Status

**Phase 1 (Foundation) — complete.** Index folder → SQLite with thumbnails + EXIF, library grid.

**Phase 2a (CV pipeline) — complete.** Blur + face detection + perceptual hash; pHash duplicate groups.

**Phase 2b (Semantic CV) — complete.** OpenCLIP embeddings, scene tags, SFace face embeddings, exposure scoring. Face clustering retained in code but de-emphasized in v1 UX (People page not surfaced in nav).

**Phase 3a (Selection) — complete.** Aggregate scoring + album/calendar selection algorithms (chronological, seasonal-memory). Year filter, per-month cap, adjacent-month fallback.

**Phase 3b (Layout + Review) — complete.** Layout templates + page assembly + visual review UI. Click any slot to swap via the popup picker (sortable by score, chronological, or visual similarity using CLIP embeddings). Drop-in workflow: Generate → review → swap as needed → done.

Phase 4 (PDF export + LLM captions) is planned but not yet implemented.

See `docs/superpowers/specs/2026-05-14-family-album-builder-design.md` for the design.
```

- [ ] **Step 2: Verify the plan is in the repo**

```bash
ls docs/superpowers/plans/
```

If `2026-05-16-family-album-phase-3b-layout-review.md` isn't already copied from slop-ideas, copy it.

- [ ] **Step 3: Final commit + tag + push**

```bash
git add README.md docs/superpowers/plans/
git commit -m "Phase 3b close-out: README, plan copy"
git tag phase-3b-layout-review
git push origin main
git push origin phase-3b-layout-review
```

---

## Phase 3b Definition of Done

- [ ] Migration 006 runs cleanly on existing Phase 3a databases.
- [ ] Generate Album: produces selection + page rows; navigates to `/projects/[id]/album/review`.
- [ ] Generate Calendar: produces selection + 12 pages (one per month); navigates to `/projects/[id]/calendar/review`.
- [ ] Album review page shows pages stacked vertically; each rendered with its template + slot photos.
- [ ] Calendar review page shows 12 pages in a 2-column grid.
- [ ] Clicking any slot opens the PhotoPicker popup.
- [ ] PhotoPicker shows candidate photos for the slot's bucket, sortable by score / chronological / similarity.
- [ ] Visual similarity sort uses CLIP embedding cosine to the current slot photo (disabled if the current slot has no embedding).
- [ ] Picking a candidate updates the slot's photo_id; the picker closes; the page re-renders with the new photo.
- [ ] Esc / backdrop click closes the picker without changes.
- [ ] All existing tests still pass.

---

## Out of Phase 3b (deferred)

- Drag-to-reposition / scroll-to-zoom inside a slot — **Phase 3c**
- Per-page template override — **Phase 3c**
- Month divider pages, year cover, calendar date grid — **Phase 3c / Phase 4**
- More layout templates (six-grid, pano-band, mixed) — **Phase 3c**
- Multi-day pages, week pages — **Phase 3c**
- Calendar page actual landscape rendering (currently same template as photo card) — **Phase 4 when PDF rendering lands**
- People page resurrection — held out indefinitely
- PDF export — **Phase 4**
- LLM captions / titles — **Phase 4**
