# Family Album & Calendar Builder — Phase 3d (Slot Transform + Auto-Position + Insert Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make slots feel like real photo frames. Default crop is **smart** (face-aware via existing Phase 2a face data — no AI/LLM needed), and the user can **drag and scroll-to-zoom** inside any slot to override. Plus the small affordance the layout system has been missing: **insert a blank page** anywhere in the album.

**Architecture:** The `page_slot.transform_json` column already exists (Phase 3b migration). Schema is untouched. We define a transform JSON shape (`{ offsetX, offsetY, scale }` in unit-square coordinates relative to the slot), implement a deterministic auto-position function that reads from `face` rows + `photo_tag` rows, and add Svelte pointer/wheel handlers on each slot. Manual override beats auto: if `transform_json` is set, that wins; otherwise auto-position runs at render time. A "Reset crop" button clears the manual transform so auto-position re-applies. Insert-blank-page is a small DB op + dashboard/review button.

**Tech Stack additions:** None — pure TS/Svelte/SQLite.

**Spec reference:** `slop-ideas/docs/superpowers/specs/2026-05-14-family-album-builder-design.md` (Layout section).

**Working directory:** All tasks run from `/Users/meigo/Projects/slop/slop-family-album/`.

**Phase 3d NOT in scope** (deferred to 3e or 4):
- Per-photo brightness/contrast adjustment — **Phase 3e if user demand**
- Drag-to-reorder pages (up/down arrows still work) — **Phase 3e if user demand**
- Multi-touch / mobile pointer support beyond basic — **Phase 4 if mobile target surfaces**
- PDF export honoring transforms — **Phase 4** (export must respect manual transforms)
- LLM captions — **Phase 4**

---

## File Structure (Phase 3d additions)

```
slop-family-album/
  src/lib/
    db/index.ts                              # add transform read/write helpers + insertBlankPage
    layout/
      autoposition.ts                        # NEW — rule-based default crop from face/tag data
    components/
      PageView.svelte                        # MODIFIED — accept transforms, render with CSS transform
      SlotEditor.svelte                      # NEW — drag/wheel handlers, "Reset crop" button
  src/routes/projects/[id]/
    album/review/+page.{ts,svelte}           # MODIFIED — pass face data + autoposition; insert-page button
    calendar/review/+page.{ts,svelte}        # MODIFIED — same
```

---

## Phase 3D.1 — Transform Shape + DB

### Task 1: Define transform shape + DB helpers

- [ ] **Step 1: Define the transform shape**

The transform is stored as JSON in `page_slot.transform_json`. Shape:

```ts
// In src/lib/layout/transform.ts (new file)
export interface SlotTransform {
  /** Horizontal offset, fraction of the slot width. 0 = centered.
   *  Positive moves the photo right (revealing more of the left side
   *  of the photo to the right of slot center). */
  offsetX: number;
  /** Vertical offset, fraction of the slot height. 0 = centered. */
  offsetY: number;
  /** Scale relative to the smallest fit (cover). 1 = `object-fit: cover`
   *  default. >1 zooms in. <1 isn't meaningful (would show empty area). */
  scale: number;
}

export const IDENTITY_TRANSFORM: SlotTransform = { offsetX: 0, offsetY: 0, scale: 1 };

export function parseTransform(json: string | null): SlotTransform | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed.offsetX !== 'number' || typeof parsed.offsetY !== 'number' || typeof parsed.scale !== 'number') {
      return null;
    }
    return { offsetX: parsed.offsetX, offsetY: parsed.offsetY, scale: parsed.scale };
  } catch {
    return null;
  }
}

export function serializeTransform(t: SlotTransform): string {
  return JSON.stringify({ offsetX: t.offsetX, offsetY: t.offsetY, scale: t.scale });
}

/** Returns the CSS object-position string + transform string for an
 *  <img> rendered inside its slot. Slot is `object-fit: cover` so the
 *  image fills the slot area; we then translate/scale to apply the
 *  user's adjustment. */
export function cssForTransform(t: SlotTransform): { transform: string; transformOrigin: string } {
  const dx = (t.offsetX * 100).toFixed(2);
  const dy = (t.offsetY * 100).toFixed(2);
  const s = t.scale.toFixed(4);
  return {
    transform: `translate(${dx}%, ${dy}%) scale(${s})`,
    transformOrigin: 'center center',
  };
}
```

- [ ] **Step 2: Add DB helpers**

Append to `src/lib/db/index.ts`:

```ts
export async function updateSlotTransform(pageId: number, slotIndex: number, transformJson: string | null): Promise<void> {
  const d = await db();
  // UPSERT so a slot row exists even if the user hasn't picked a photo for
  // it yet (rare but possible if they jump straight to crop adjustment).
  await d.execute(
    `INSERT INTO page_slot (page_id, slot_index, photo_id, transform_json) VALUES (?, ?, NULL, ?)
     ON CONFLICT (page_id, slot_index) DO UPDATE SET transform_json = excluded.transform_json`,
    [pageId, slotIndex, transformJson]
  );
  // Bump selection.updated_at (transforms count as edits).
  await d.execute(
    `UPDATE selection SET updated_at = ?
     WHERE id = (SELECT selection_id FROM page WHERE id = ?)`,
    [Date.now(), pageId]
  );
}

/** Insert a blank page at the given index_in_book, shifting later pages
 *  down by 1. Returns the new page's id. The template defaults to
 *  `hero-1` (album) or `cal-month` (calendar) — caller decides based on
 *  the page's selection kind. */
export async function insertBlankPage(args: {
  selection_id: number;
  insert_at: number;
  template_id: string;
}): Promise<number> {
  const d = await db();
  // Shift later pages down.
  await d.execute(
    'UPDATE page SET index_in_book = index_in_book + 1 WHERE selection_id = ? AND index_in_book >= ?',
    [args.selection_id, args.insert_at]
  );
  const r = await d.execute(
    'INSERT INTO page (selection_id, index_in_book, template_id) VALUES (?, ?, ?)',
    [args.selection_id, args.insert_at, args.template_id]
  );
  await d.execute('UPDATE selection SET updated_at = ? WHERE id = ?', [Date.now(), args.selection_id]);
  return r.lastInsertId as number;
}

/** Photo's natural dimensions + the face boxes for that photo, used by
 *  auto-position. Returns null if the photo isn't found or has no
 *  dimensions. */
export async function getPhotoLayoutContext(photoId: number): Promise<{ width: number; height: number; faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>; topTag: string | null } | null> {
  const d = await db();
  const photos = await d.select<{ width: number | null; height: number | null }[]>(
    'SELECT width, height FROM photo WHERE id = ?', [photoId]
  );
  const p = photos[0];
  if (!p || p.width === null || p.height === null) return null;
  const faces = await d.select<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }[]>(
    'SELECT bbox_x, bbox_y, bbox_w, bbox_h FROM face WHERE photo_id = ?', [photoId]
  );
  const tagRows = await d.select<{ tag: string }[]>(
    'SELECT tag FROM photo_tag WHERE photo_id = ? ORDER BY score DESC LIMIT 1', [photoId]
  );
  return { width: p.width, height: p.height, faces, topTag: tagRows[0]?.tag ?? null };
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build && npm run check
```

Both must pass.

- [ ] **Step 4: Commit + push**

```bash
git add src/lib/layout/transform.ts src/lib/db/index.ts
git commit -m "Slot transform shape + DB helpers (updateSlotTransform, insertBlankPage, getPhotoLayoutContext)"
git push origin main
```

---

## Phase 3D.2 — Auto-Position

### Task 2: Rule-based auto-position from face data

- [ ] **Step 1: Create `src/lib/layout/autoposition.ts`**

```ts
import type { SlotLayout } from './templates';
import { IDENTITY_TRANSFORM, type SlotTransform } from './transform';

/**
 * Compute a default crop transform for a photo placed in a slot.
 *
 * Inputs:
 *   - photoWidth/photoHeight: natural pixel dimensions of the photo
 *   - faces: detected face bounding boxes in photo pixel coordinates
 *     (from `face` table; may be empty)
 *   - topTag: top scene tag from `photo_tag` table (or null)
 *   - slot: slot's normalized layout (x, y, w, h in 0-1 of page)
 *
 * Output: a SlotTransform that, applied to the photo-in-slot, makes the
 * subject visible. The slot already uses `object-fit: cover`, which scales
 * the photo to fill the slot's aspect ratio (cropping the longer dimension).
 * This function then translates the photo so the subject stays in frame.
 *
 * Rule order:
 *   1. If faces exist: compute bounding box around all faces; translate so
 *      that bbox's center sits at the slot's center, with ~25% padding
 *      above/around so heads don't kiss the slot edges.
 *   2. Else if topTag suggests a horizon-biased scene (landscape, beach,
 *      forest, snow, city, outdoor): shift down ~15% so the horizon sits
 *      at the upper third (rule-of-thirds).
 *   3. Else: identity (object-fit: cover center crop).
 *
 * All math is in normalized [0..1] photo-relative space, then converted to
 * slot-relative offsets.
 *
 * This is deterministic and inexpensive (no model inference). It produces
 * the default; if the user manually adjusts via SlotEditor, that override
 * is stored in `page_slot.transform_json` and beats this function.
 */
export function autoPositionTransform(args: {
  photoWidth: number;
  photoHeight: number;
  faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
  topTag: string | null;
  slot: SlotLayout;
}): SlotTransform {
  const { photoWidth, photoHeight, faces, topTag, slot } = args;

  // Slot aspect ratio (within the page; absolute pixel size depends on page).
  // The page's container has known aspect (square or landscape); slot.w/slot.h
  // are fractions of the page. Slot's actual pixel-aspect is (slot.w *
  // pageW) / (slot.h * pageH). For 'square' pages (1:1), slot's aspect is
  // just slot.w / slot.h.
  // We approximate: slot pixel-aspect ≈ slot.w / slot.h (true for square page;
  // close enough for landscape page in this codebase).
  const slotAspect = slot.w / slot.h;
  const photoAspect = photoWidth / photoHeight;

  // After object-fit: cover, the photo is scaled so the slot is fully
  // covered. The photo's visible-area in slot coords is centered by default.
  // The amount of photo that's "outside" the slot (cropped) along each axis:
  //   - If photoAspect > slotAspect: photo is wider than slot relative to its
  //     height. Horizontal margins are cropped. visibleWidthFraction < 1.
  //   - Else: vertical margins are cropped.
  // The slot transform translate moves the photo within the slot;
  // translate(50%, 0) would shift the photo right by half the slot's width,
  // revealing more of the left side of the original photo.

  // --- Pass 1: faces ---
  if (faces.length > 0) {
    // Compute face-bbox center in [0..1] photo coordinates.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of faces) {
      minX = Math.min(minX, f.bbox_x);
      minY = Math.min(minY, f.bbox_y);
      maxX = Math.max(maxX, f.bbox_x + f.bbox_w);
      maxY = Math.max(maxY, f.bbox_y + f.bbox_h);
    }
    const cx = ((minX + maxX) / 2) / photoWidth;   // 0..1
    const cy = ((minY + maxY) / 2) / photoHeight;  // 0..1

    // To make the face-center sit at the slot's center after cover-fit,
    // translate by the difference from the cover-fit's default center (0.5,
    // 0.5). Convert from "photo-relative shift" to "slot-relative percentage"
    // by accounting for the cover-fit scale factor.

    // Cover-fit scale factor:
    //   if photoAspect > slotAspect, vertical fills → scaleFactor = slotH / photoH (visual)
    //   else horizontal fills → scaleFactor = slotW / photoW
    // But we work in normalized fractions, so what we need is: how much of the
    // photo (in its own [0..1] space) is visible along the cropped axis?

    let visibleFractionX: number;
    let visibleFractionY: number;
    if (photoAspect > slotAspect) {
      visibleFractionY = 1;
      visibleFractionX = slotAspect / photoAspect;  // < 1
    } else {
      visibleFractionX = 1;
      visibleFractionY = photoAspect / slotAspect;
    }

    // The face center should align with the slot center. By default
    // (translate 0), the slot's center sees photo[0.5, 0.5]. To make it
    // see photo[cx, cy] instead, we need to translate the photo by
    // (0.5 - cx) along x (in photo-fraction), then convert that to slot-
    // fraction by dividing by visibleFractionX.

    // Translate in slot-relative fraction (so multiplied by 100% in CSS):
    const offsetX = ((0.5 - cx) / visibleFractionX);
    const offsetY = ((0.5 - cy) / visibleFractionY);

    // Clamp: don't translate so far that the slot shows empty area beyond
    // the photo's edges. Max safe translation along an axis equals
    // (1 - visibleFraction) / 2 in slot-fraction.
    const maxOffsetX = (1 - visibleFractionX) / (2 * visibleFractionX);
    const maxOffsetY = (1 - visibleFractionY) / (2 * visibleFractionY);
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));

    return { offsetX: clampedX, offsetY: clampedY, scale: 1 };
  }

  // --- Pass 2: horizon-biased tags ---
  if (topTag) {
    const horizonTags = new Set(['landscape', 'beach', 'forest', 'snow', 'city', 'outdoor']);
    if (horizonTags.has(topTag)) {
      // Shift down so horizon (assumed at photo y=0.5) sits at slot y=0.33.
      // In slot-fraction: bring photo center DOWN by 0.17.
      // But this is bounded by visibleFractionY too.
      let visibleFractionY = 1;
      if (photoAspect > slotAspect) {
        // pass — full vertical visible
      } else {
        visibleFractionY = photoAspect / slotAspect;
      }
      const desiredOffsetY = -0.17 / visibleFractionY;
      const maxOffsetY = (1 - visibleFractionY) / (2 * visibleFractionY);
      const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, desiredOffsetY));
      return { offsetX: 0, offsetY: clampedY, scale: 1 };
    }
  }

  // --- Pass 3: identity ---
  return { ...IDENTITY_TRANSFORM };
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build && npm run check
```

Both must pass.

- [ ] **Step 3: Commit + push**

```bash
git add src/lib/layout/autoposition.ts
git commit -m "Layout: autoPositionTransform — rule-based crop default from face + tag data"
git push origin main
```

---

## Phase 3D.3 — Render with transforms

### Task 3: Update PageView to apply transforms

- [ ] **Step 1: Update `src/lib/components/PageView.svelte`**

The Slot interface gains `transform_json`. The render block applies the transform via CSS. When `transform_json` is null, we run `autoPositionTransform` to get the default (which needs face data + dimensions).

Read the existing file first; preserve the structural shape.

```svelte
<script lang="ts">
  import { getTemplate, type Template } from '$lib/layout/templates';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import {
    parseTransform, cssForTransform, type SlotTransform, IDENTITY_TRANSFORM,
  } from '$lib/layout/transform';
  import { autoPositionTransform } from '$lib/layout/autoposition';

  interface Slot {
    slot_index: number;
    photo_id: number | null;
    path: string | null;
    thumb_path: string | null;
    transform_json: string | null;
    /** Photo's natural pixel dimensions, used by auto-position. May be null
     *  when the slot is empty or photo metadata is missing. */
    photo_width: number | null;
    photo_height: number | null;
    /** Face bboxes for this photo (used by auto-position). */
    faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
    top_tag: string | null;
  }

  interface Props {
    templateId: string;
    slots: Slot[];
    onSlotClick?: (slotIndex: number) => void;
  }
  let { templateId, slots, onSlotClick }: Props = $props();

  let tpl = $derived<Template>(getTemplate(templateId));
  let aspectRatio = $derived(tpl.aspect === 'square' ? '1 / 1' : '4 / 3');

  let orderedSlots = $derived([...slots].sort((a, b) => a.slot_index - b.slot_index));

  function effectiveTransform(slot: Slot, slotLayout: { x: number; y: number; w: number; h: number }): SlotTransform {
    const manual = parseTransform(slot.transform_json);
    if (manual) return manual;
    if (slot.photo_width !== null && slot.photo_height !== null) {
      return autoPositionTransform({
        photoWidth: slot.photo_width,
        photoHeight: slot.photo_height,
        faces: slot.faces,
        topTag: slot.top_tag,
        slot: slotLayout,
      });
    }
    return IDENTITY_TRANSFORM;
  }
</script>

<div
  class="relative w-full surface-card p-0 overflow-hidden"
  style="aspect-ratio: {aspectRatio}; border: 1px solid var(--color-line);"
>
  {#each tpl.slots as slotLayout, i}
    {@const slot = orderedSlots[i]}
    {@const t = slot ? effectiveTransform(slot, slotLayout) : IDENTITY_TRANSFORM}
    {@const css = cssForTransform(t)}
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
        {#if slot?.path}
          <img
            src={convertFileSrc(slot.path)}
            alt=""
            class="w-full h-full object-cover"
            style="transform: {css.transform}; transform-origin: {css.transformOrigin};"
            draggable="false"
            loading="lazy"
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

- [ ] **Step 2: Update review-route loaders to fetch the extra slot context**

Update `src/routes/projects/[id]/album/review/+page.ts` (and same for calendar) to fetch face boxes + dimensions + top tag for each slot's photo, attaching them to the slot objects.

For album:

```ts
import {
  getProject, getCurrentSelection, listPagesForSelection, listSlotsForPages,
  db,
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

  // Fetch photo dimensions + faces + top tags in bulk for all photo_ids
  // in any slot. Adds 3 small queries, all keyed by photo_id IN (...).
  const photoIds = [...new Set(slots.map((s) => s.photo_id).filter((x): x is number => x !== null))];
  const photoMeta = new Map<number, { width: number | null; height: number | null }>();
  const facesByPhoto = new Map<number, Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>>();
  const topTagByPhoto = new Map<number, string>();

  if (photoIds.length > 0) {
    const d = await db();
    const placeholders = photoIds.map(() => '?').join(',');
    const photoRows = await d.select<{ id: number; width: number | null; height: number | null }[]>(
      `SELECT id, width, height FROM photo WHERE id IN (${placeholders})`,
      photoIds
    );
    for (const p of photoRows) photoMeta.set(p.id, { width: p.width, height: p.height });

    const faceRows = await d.select<{ photo_id: number; bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }[]>(
      `SELECT photo_id, bbox_x, bbox_y, bbox_w, bbox_h FROM face WHERE photo_id IN (${placeholders})`,
      photoIds
    );
    for (const f of faceRows) {
      const arr = facesByPhoto.get(f.photo_id) ?? [];
      arr.push({ bbox_x: f.bbox_x, bbox_y: f.bbox_y, bbox_w: f.bbox_w, bbox_h: f.bbox_h });
      facesByPhoto.set(f.photo_id, arr);
    }

    const tagRows = await d.select<{ photo_id: number; tag: string }[]>(
      `SELECT pt.photo_id, pt.tag FROM photo_tag pt
       INNER JOIN (
         SELECT photo_id, MAX(score) as ms FROM photo_tag WHERE photo_id IN (${placeholders}) GROUP BY photo_id
       ) m ON m.photo_id = pt.photo_id AND m.ms = pt.score
       WHERE pt.photo_id IN (${placeholders})`,
      [...photoIds, ...photoIds]
    );
    for (const t of tagRows) topTagByPhoto.set(t.photo_id, t.tag);
  }

  // Enrich each slot.
  type EnrichedSlot = (typeof slots)[number] & {
    photo_width: number | null;
    photo_height: number | null;
    faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
    top_tag: string | null;
  };
  const enriched: EnrichedSlot[] = slots.map((s) => {
    const meta = s.photo_id !== null ? photoMeta.get(s.photo_id) : null;
    return {
      ...s,
      photo_width: meta?.width ?? null,
      photo_height: meta?.height ?? null,
      faces: s.photo_id !== null ? (facesByPhoto.get(s.photo_id) ?? []) : [],
      top_tag: s.photo_id !== null ? (topTagByPhoto.get(s.photo_id) ?? null) : null,
    };
  });

  const slotsByPage = new Map<number, EnrichedSlot[]>();
  for (const s of enriched) {
    const arr = slotsByPage.get(s.page_id) ?? [];
    arr.push(s);
    slotsByPage.set(s.page_id, arr);
  }
  return { project, selection, pages, slotsByPage };
}
```

Repeat the same pattern in `src/routes/projects/[id]/calendar/review/+page.ts`.

- [ ] **Step 3: Build verification**

```bash
npm run build && npm run check
```

Both must pass.

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "Render slots with auto-position from face data; loaders enrich slots with photo meta + faces + top tag"
git push origin main
```

---

## Phase 3D.4 — Slot Editor (drag + zoom)

### Task 4: SlotEditor component

The flow: clicking a slot still opens the PhotoPicker by default. Add an **"Adjust crop"** button at the bottom of the picker that, when clicked, closes the picker and enters slot-editor mode for THAT slot. In slot-editor mode, the slot has an overlay with drag handle + zoom + "Reset" + "Done". Drag = translate; mouse wheel = scale. Done writes transform_json + invalidates.

- [ ] **Step 1: Create `src/lib/components/SlotEditor.svelte`**

```svelte
<script lang="ts">
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import {
    parseTransform, serializeTransform, cssForTransform,
    type SlotTransform, IDENTITY_TRANSFORM,
  } from '$lib/layout/transform';
  import { autoPositionTransform } from '$lib/layout/autoposition';
  import { updateSlotTransform } from '$lib/db';
  import { invalidateAll } from '$app/navigation';
  import type { SlotLayout } from '$lib/layout/templates';

  interface Props {
    pageId: number;
    slotIndex: number;
    photoPath: string;
    photoWidth: number;
    photoHeight: number;
    initialTransformJson: string | null;
    slotLayout: SlotLayout;
    pageAspect: 'square' | 'landscape';
    faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
    topTag: string | null;
    onClose: () => void;
  }
  let { pageId, slotIndex, photoPath, photoWidth, photoHeight, initialTransformJson, slotLayout, pageAspect, faces, topTag, onClose }: Props = $props();

  function initialTransform(): SlotTransform {
    const parsed = parseTransform(initialTransformJson);
    if (parsed) return parsed;
    return autoPositionTransform({ photoWidth, photoHeight, faces, topTag, slot: slotLayout });
  }

  let t = $state<SlotTransform>(initialTransform());
  let dragging = $state(false);
  let dragStart = $state<{ x: number; y: number; t0: SlotTransform } | null>(null);

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY, t0: { ...t } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !dragStart) return;
    const dx = (e.clientX - dragStart.x);
    const dy = (e.clientY - dragStart.y);
    // dx/dy are pixels. Convert to slot-fraction by dividing by the slot's
    // rendered width/height. We grab those from the container's bounding
    // rect via getBoundingClientRect.
    const container = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const slotW = container.width;
    const slotH = container.height;
    t = {
      offsetX: dragStart.t0.offsetX + dx / slotW,
      offsetY: dragStart.t0.offsetY + dy / slotH,
      scale: dragStart.t0.scale,
    };
  }

  function onPointerUp(e: PointerEvent) {
    dragging = false;
    dragStart = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    // Wheel up = zoom in. Trackpad pinch sends wheel events too.
    const delta = -e.deltaY * 0.002;
    const newScale = Math.max(1, Math.min(4, t.scale * (1 + delta)));
    t = { ...t, scale: newScale };
  }

  async function save() {
    await updateSlotTransform(pageId, slotIndex, serializeTransform(t));
    await invalidateAll();
    onClose();
  }

  async function reset() {
    await updateSlotTransform(pageId, slotIndex, null);
    await invalidateAll();
    onClose();
  }

  let css = $derived(cssForTransform(t));
  let aspectRatio = $derived(pageAspect === 'square' ? '1 / 1' : '4 / 3');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div
  class="fixed inset-0 z-50 flex items-center justify-center"
  style="background: rgba(0, 0, 0, 0.85);"
>
  <div class="surface-card relative" style="width: 90vw; max-width: 700px;">
    <div class="flex items-baseline justify-between mb-3">
      <h3 class="text-lg font-medium">Adjust crop</h3>
      <p class="text-sm" style="color: var(--color-muted)">drag to reposition · scroll/pinch to zoom</p>
    </div>
    <!-- The slot's actual aspect ratio inside the page is (slotLayout.w / slotLayout.h)
         for square pages, or (slotLayout.w * 4 / 3) / slotLayout.h for landscape.
         For the editor we render the slot itself at a comfortable size. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="relative w-full overflow-hidden"
      style="
        aspect-ratio: {slotLayout.w * (pageAspect === 'landscape' ? 4/3 : 1)} / {slotLayout.h};
        background: var(--color-line);
        touch-action: none;
        user-select: none;
      "
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onwheel={onWheel}
    >
      <img
        src={convertFileSrc(photoPath)}
        alt=""
        class="w-full h-full object-cover"
        style="transform: {css.transform}; transform-origin: {css.transformOrigin}; pointer-events: none;"
        draggable="false"
      />
    </div>
    <div class="flex gap-2 mt-3">
      <button type="button" class="btn-primary" onclick={save}>Save crop</button>
      <button type="button" class="btn-secondary" onclick={reset} title="Clear manual crop and use the smart default">Reset to auto</button>
      <button type="button" class="btn-ghost ml-auto" onclick={onClose}>Cancel (Esc)</button>
    </div>
    <p class="text-xs mt-2" style="color: var(--color-muted)">
      Scale {t.scale.toFixed(2)}× · offset ({(t.offsetX * 100).toFixed(0)}%, {(t.offsetY * 100).toFixed(0)}%)
    </p>
  </div>
</div>
```

- [ ] **Step 2: Wire the "Adjust crop" affordance into the album review route**

In `src/routes/projects/[id]/album/review/+page.svelte`:

Add SlotEditor + a state for "editor mode" alongside the existing PhotoPicker state. The picker gets an "Adjust crop" button at the bottom that opens the editor for the currently-being-edited slot.

Update `<script>`:

```ts
  import SlotEditor from '$lib/components/SlotEditor.svelte';
  import { getTemplate } from '$lib/layout/templates';

  let editorOpen = $state<null | {
    pageId: number;
    slotIndex: number;
    photoPath: string;
    photoWidth: number;
    photoHeight: number;
    initialTransformJson: string | null;
    slotLayoutW: number;
    slotLayoutH: number;
    slotLayoutX: number;
    slotLayoutY: number;
    faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
    topTag: string | null;
  }>(null);

  function openEditor(pageId: number, slotIndex: number) {
    const page = data.pages.find((p) => p.id === pageId);
    if (!page) return;
    const slots = data.slotsByPage.get(pageId) ?? [];
    const slot = slots.find((s) => s.slot_index === slotIndex);
    if (!slot || !slot.path || slot.photo_width === null || slot.photo_height === null) return;
    const tpl = getTemplate(page.template_id);
    const slotLayout = tpl.slots[slotIndex];
    if (!slotLayout) return;
    pickerOpen = null;
    editorOpen = {
      pageId, slotIndex,
      photoPath: slot.path,
      photoWidth: slot.photo_width,
      photoHeight: slot.photo_height,
      initialTransformJson: slot.transform_json,
      slotLayoutX: slotLayout.x,
      slotLayoutY: slotLayout.y,
      slotLayoutW: slotLayout.w,
      slotLayoutH: slotLayout.h,
      faces: slot.faces,
      topTag: slot.top_tag,
    };
  }
```

Where the existing `<PhotoPicker ... />` element is, add an `onEdit` prop that the picker can call. (Picker also needs updating — Task 5 below.)

Add the `<SlotEditor />` mount conditional:

```svelte
  {#if editorOpen}
    <SlotEditor
      pageId={editorOpen.pageId}
      slotIndex={editorOpen.slotIndex}
      photoPath={editorOpen.photoPath}
      photoWidth={editorOpen.photoWidth}
      photoHeight={editorOpen.photoHeight}
      initialTransformJson={editorOpen.initialTransformJson}
      slotLayout={{ x: editorOpen.slotLayoutX, y: editorOpen.slotLayoutY, w: editorOpen.slotLayoutW, h: editorOpen.slotLayoutH }}
      pageAspect="square"
      faces={editorOpen.faces}
      topTag={editorOpen.topTag}
      onClose={() => editorOpen = null}
    />
  {/if}
```

Mirror for calendar review (`pageAspect="landscape"`).

### Task 5: PhotoPicker gains "Adjust crop" button

- [ ] **Step 1: Update `src/lib/components/PhotoPicker.svelte`**

Add an optional `onEdit` callback prop. If provided, render an "Adjust crop" button at the top of the picker (next to "Close") that calls `onEdit()` and closes the picker. The slot-editor opens.

In Props:

```ts
  interface Props {
    projectId: number;
    kind: 'album' | 'calendar';
    bucketKey?: string;
    sourceYear?: number;
    currentPhotoId: number | null;
    onPick: (photoId: number) => void;
    onClose: () => void;
    onEdit?: () => void;            // NEW
  }
  let { projectId, kind, bucketKey, sourceYear, currentPhotoId, onPick, onClose, onEdit }: Props = $props();
```

In template, alter the top row to include the button when `onEdit` is provided AND there's a current photo:

```svelte
    <div class="flex items-baseline justify-between mb-3 gap-2">
      <h3 class="text-lg font-medium">Pick a photo</h3>
      <div class="flex gap-2">
        {#if onEdit && currentPhotoId !== null}
          <button type="button" class="btn-secondary" onclick={onEdit}>Adjust crop</button>
        {/if}
        <button type="button" class="btn-ghost" onclick={onClose}>Close (Esc)</button>
      </div>
    </div>
```

Then in the review routes' picker mount, pass:

```svelte
    <PhotoPicker
      projectId={data.project.id}
      kind="album"
      currentPhotoId={pickerOpen.currentPhotoId}
      onPick={pickPhoto}
      onClose={() => pickerOpen = null}
      onEdit={() => pickerOpen && openEditor(pickerOpen.pageId, pickerOpen.slotIndex)}
    />
```

Same for calendar.

- [ ] **Step 2: Build + commit + push (combine Tasks 4 + 5)**

```bash
npm run build && npm run check
git add src/lib/components/SlotEditor.svelte src/lib/components/PhotoPicker.svelte src/routes/projects/[id]/album/review/+page.svelte src/routes/projects/[id]/calendar/review/+page.svelte
git commit -m "Slot editor: drag-to-reposition + scroll/pinch zoom + reset; picker gains Adjust-crop button"
git push origin main
```

---

## Phase 3D.5 — Insert Blank Page

### Task 6: Insert-blank-page affordance

- [ ] **Step 1: Add insert buttons between pages in the album review**

Each rendered page in the album review is in a `<section>`. Between consecutive sections, add a small "+ insert blank page below" button. Same for calendar.

In `src/routes/projects/[id]/album/review/+page.svelte`, inside the `{#each data.pages as page, idx}` block, AFTER each section, add:

```svelte
    {#each data.pages as page, idx}
      <section>
        ... existing ...
      </section>
      <button
        type="button"
        class="btn-secondary self-center"
        style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
        onclick={() => insertBlankBelow(idx)}
        disabled={inserting}
        title="Insert a blank hero-1 page after page {idx + 1}"
      >
        + insert blank page
      </button>
    {/each}
```

Also add an insert-at-top button BEFORE the each loop:

```svelte
    <button
      type="button"
      class="btn-secondary self-center mb-2"
      style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
      onclick={() => insertBlankBelow(-1)}
      disabled={inserting}
      title="Insert a blank hero-1 page at the start"
    >
      + insert blank page at start
    </button>
```

Handler:

```ts
  import { insertBlankPage } from '$lib/db';

  let inserting = $state(false);

  async function insertBlankBelow(idx: number) {
    if (!data.selection) return;
    inserting = true;
    try {
      await insertBlankPage({
        selection_id: data.selection.id,
        insert_at: idx + 1,
        template_id: 'hero-1',
      });
      await invalidateAll();
    } finally {
      inserting = false;
    }
  }
```

Calendar uses `'cal-month'` instead of `'hero-1'`. Mirror the same buttons in calendar review.

- [ ] **Step 2: Build verification**

```bash
npm run build && npm run check
```

Both must pass.

- [ ] **Step 3: Commit + push**

```bash
git add -A
git commit -m "Review: insert-blank-page buttons (hero-1 for album, cal-month for calendar)"
git push origin main
```

---

## Phase 3D.6 — Close-out

### Task 7: README + tag

- [ ] **Step 1: Update `README.md` Status section**

```markdown
## Status

**Phase 1 (Foundation) — complete.** Index folder → SQLite with thumbnails + EXIF, library grid.

**Phase 2a (CV pipeline) — complete.** Blur + face detection + perceptual hash; pHash duplicate groups.

**Phase 2b (Semantic CV) — complete.** OpenCLIP embeddings, scene tags, SFace face embeddings, exposure scoring.

**Phase 3a (Selection) — complete.** Aggregate scoring + album/calendar selection.

**Phase 3b (Layout + Review) — complete.** Auto-composed pages + popup picker.

**Phase 3c (Review power) — complete.** Per-page template dropdown, reorder, delete.

**Phase 3d (Slot transform + auto-position) — complete.** Drag-to-reposition + scroll/pinch zoom inside any slot, face-aware default crop (no AI needed — uses Phase 2a face data), insert blank pages anywhere in the album.

Phase 4 (PDF export + LLM captions + optional per-photo color) is planned but not yet implemented.

See `docs/superpowers/specs/2026-05-14-family-album-builder-design.md` for the design.
```

- [ ] **Step 2: Verify plan present**

```bash
ls docs/superpowers/plans/
```

Should include `2026-05-16-family-album-phase-3d-slot-transform.md`. If missing, copy from `slop-ideas`.

- [ ] **Step 3: Final commit + tag + push**

```bash
git add README.md docs/superpowers/plans/
git commit -m "Phase 3d close-out: README updated"
git tag phase-3d-slot-transform
git push origin main
git push origin phase-3d-slot-transform
```

---

## Phase 3d Definition of Done

- [ ] Every photo slot renders with either its manual `transform_json` (user-edited) or a face-aware auto-position default (Phase 2a face data).
- [ ] Clicking a slot opens PhotoPicker (existing flow); the picker has a new "Adjust crop" button that opens the SlotEditor for the current photo.
- [ ] SlotEditor lets the user drag (pointer events) and scroll-zoom (wheel). Save persists transform_json; Reset clears it (auto-position resumes); Cancel closes without changes.
- [ ] "+ insert blank page" buttons appear between every pair of pages + at the start. Click adds a new page at that position; later pages shift down.
- [ ] Selection updated_at bumps on transform save + page insert.
- [ ] All existing tests pass.

---

## Out of Phase 3d

- Per-photo brightness/contrast adjustment — **Phase 3e if user demand**
- Drag-to-reorder pages — **Phase 3e if user demand**
- Touch/mobile gesture refinement — **Phase 4** when mobile target surfaces
- PDF export rendering transforms — **Phase 4** (export must respect manual transforms)
- LLM captions — **Phase 4**
