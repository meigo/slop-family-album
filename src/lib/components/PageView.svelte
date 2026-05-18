<script lang="ts">
  import { getTemplate, type Template } from '$lib/layout/templates';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { parseTransform, cssForTransform, hasColorShift, svgColorMatrix, type SlotTransform, IDENTITY_TRANSFORM } from '$lib/layout/transform';
  import { autoPositionTransform } from '$lib/layout/autoposition';
  import { parseYearMonth } from '$lib/calendar/grid';
  import CalendarGrid from './CalendarGrid.svelte';
  import TextOverlay from './TextOverlay.svelte';
  import type { CalendarEventRow, PageTextRow } from '$lib/db/types';
  import { Replace, Sliders, Trash2 } from '@lucide/svelte';

  interface Slot {
    slot_index: number;
    photo_id: number | null;
    path: string | null;
    thumb_path: string | null;
    transform_json: string | null;
    photo_width: number | null;
    photo_height: number | null;
    faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
    top_tag: string | null;
  }

  interface Props {
    templateId: string;
    slots: Slot[];
    onSlotClick?: (slotIndex: number) => void;
    onSwapPhoto?: (slotIndex: number) => void;
    onAdjustCrop?: (slotIndex: number) => void;
    onRemovePhoto?: (slotIndex: number) => void;
    editingSlotIndex?: number | null;
    /** Visible gap (px) between adjacent slot images. Each slot contributes
     *  half of this as internal padding, so two adjacent slots produce
     *  exactly slotGapPx between them. */
    slotGapPx?: number;
    /** Extra inset (px) between the page's outer edge and the slot grid.
     *  0 = slots run flush to the page's frame; the only outer space is
     *  the half-gap a slot's own padding contributes. */
    pagePaddingPx?: number;
    /** Optional calendar context. When provided AND the template declares
     *  a `calendarGrid` field, the renderer draws a calendar grid at those
     *  coordinates. */
    pageTitle?: string | null;
    events?: CalendarEventRow[];
    weekStart?: 0 | 1;
    texts?: PageTextRow[];
    editingTextId?: number | null;
    onEditText?: (textId: number) => void;
    /** Page background color (hex #rrggbb). Default white. */
    pageBgColor?: string;
    /** Paper width in mm. Used for both the on-screen aspect ratio and
     *  the print @page size. Defaults to A4 landscape. */
    pageWidthMm?: number;
    pageHeightMm?: number;
    /** When true, suppress all interactive chrome (hover icons, click
     *  overlay, border) so the page renders as it should appear in print. */
    printMode?: boolean;
    /** Corner radius (px) for each slot image. 0 = square slots (default).
     *  The page itself is always rectangular; only the slot images round. */
    slotCornerRadiusPx?: number;
    /** Optional Google Font family applied to the calendar grid on
     *  calendar templates. Ignored for album templates. Caller must
     *  have already triggered loadGoogleFont. */
    calendarFontFamily?: string | null;
    /** Hex color for calendar grid text + cell borders. */
    calendarColor?: string;
    /** Hex color for Sunday column header + cells. */
    calendarWeekendColor?: string;
    /** Calendar grid rule style. */
    calendarGridStyle?: 'boxed' | 'grid' | 'lines' | 'none';
  }
  let { templateId, slots, onSlotClick, onSwapPhoto, onAdjustCrop, onRemovePhoto, editingSlotIndex = null, slotGapPx = 2, pagePaddingPx = 0, pageTitle = null, events = [], weekStart = 1, texts = [], editingTextId = null, onEditText, pageBgColor = '#ffffff', pageWidthMm = 297, pageHeightMm = 210, printMode = false, slotCornerRadiusPx = 0, calendarFontFamily = null, calendarColor = '#000000', calendarWeekendColor = '#dc2626', calendarGridStyle = 'boxed' }: Props = $props();

  let tpl = $derived<Template>(getTemplate(templateId));
  let aspectRatio = $derived(`${pageWidthMm} / ${pageHeightMm}`);
  let orderedSlots = $derived([...slots].sort((a, b) => a.slot_index - b.slot_index));

  // Per-PageView instance ID so SVG filter URLs don't collide between
  // multiple PageView mounts on the same review page.
  const instanceId = Math.random().toString(36).slice(2, 8);

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
  class="relative w-full overflow-hidden"
  style="aspect-ratio: {aspectRatio}; background: {pageBgColor}; border-radius: 0; box-shadow: {printMode ? 'none' : '0 0 6px rgba(0, 0, 0, 0.08)'};"
>
  {#each tpl.slots as slotLayout, i}
    {@const slot = orderedSlots[i]}
    {@const t = slot ? effectiveTransform(slot, slotLayout) : IDENTITY_TRANSFORM}
    {@const css = cssForTransform(t)}
    {@const isEditing = editingSlotIndex === i}
    {@const half = slotGapPx / 2}
    {@const padTop    = slotLayout.y <= 0.001 ? 0 : half}
    {@const padLeft   = slotLayout.x <= 0.001 ? 0 : half}
    {@const padBottom = slotLayout.y + slotLayout.h >= 0.999 ? 0 : half}
    {@const padRight  = slotLayout.x + slotLayout.w >= 0.999 ? 0 : half}
    <div
      class="absolute group"
      style="
        left: calc({pagePaddingPx}px + {slotLayout.x} * (100% - {2 * pagePaddingPx}px));
        top: calc({pagePaddingPx}px + {slotLayout.y} * (100% - {2 * pagePaddingPx}px));
        width: calc({slotLayout.w} * (100% - {2 * pagePaddingPx}px));
        height: calc({slotLayout.h} * (100% - {2 * pagePaddingPx}px));
        padding: {padTop}px {padRight}px {padBottom}px {padLeft}px;
      "
    >
      <div class="relative w-full h-full overflow-hidden" style="border-radius: {slotCornerRadiusPx}px;">
        {#if slot?.path}
          <img
            src={convertFileSrc(slot.path)}
            alt=""
            class="absolute inset-0 w-full h-full object-cover"
            style="object-position: {css.objectPosition}; transform: {css.transform}; transform-origin: {css.transformOrigin}; filter: {css.filter}{hasColorShift(t) ? ` url(#cm-${instanceId}-${i})` : ''};"
            draggable="false"
            loading={printMode ? 'eager' : 'lazy'}
          />
        {:else}
          <div
            class="absolute inset-0 flex items-center justify-center"
            style="color: var(--color-muted); outline: 1px dashed currentColor; outline-offset: -2px; opacity: 0.5;"
          >
            <span class="text-xs">empty slot</span>
          </div>
        {/if}

        {#if !isEditing && !printMode}
          {#if onSlotClick}
            <button
              type="button"
              class="absolute inset-0"
              style="background: none; border: none; cursor: pointer;"
              onclick={() => onSlotClick?.(i)}
              aria-label={`Edit slot ${i + 1}`}
            ></button>
          {/if}

          {#if slot?.path && (onSwapPhoto || onAdjustCrop || onRemovePhoto)}
            <div
              class="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              style="z-index: 2;"
            >
              {#if onSwapPhoto}
                <button
                  type="button"
                  class="slot-action-btn"
                  onclick={(e) => { e.stopPropagation(); onSwapPhoto?.(i); }}
                  title="Swap photo"
                  aria-label={`Swap photo in slot ${i + 1}`}
                ><Replace size={14} /></button>
              {/if}
              {#if onAdjustCrop}
                <button
                  type="button"
                  class="slot-action-btn"
                  onclick={(e) => { e.stopPropagation(); onAdjustCrop?.(i); }}
                  title="Adjust crop & color"
                  aria-label={`Adjust crop and color in slot ${i + 1}`}
                ><Sliders size={14} /></button>
              {/if}
              {#if onRemovePhoto}
                <button
                  type="button"
                  class="slot-action-btn"
                  onclick={(e) => { e.stopPropagation(); onRemovePhoto?.(i); }}
                  title="Remove photo from this slot"
                  aria-label={`Remove photo from slot ${i + 1}`}
                ><Trash2 size={14} /></button>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/each}

  {#if tpl.calendarGrid}
    {@const ym = parseYearMonth(pageTitle)}
    {#if ym}
      <div
        class="absolute"
        style="
          left: calc({pagePaddingPx}px + {tpl.calendarGrid.x} * (100% - {2 * pagePaddingPx}px));
          top: calc({pagePaddingPx}px + {tpl.calendarGrid.y} * (100% - {2 * pagePaddingPx}px));
          width: calc({tpl.calendarGrid.w} * (100% - {2 * pagePaddingPx}px));
          height: calc({tpl.calendarGrid.h} * (100% - {2 * pagePaddingPx}px));
          padding: {slotGapPx / 2}px;
        "
      >
        <div class="w-full h-full" style="padding: 4px; font-size: 1.2em;">
          <CalendarGrid
            year={ym.year}
            month={ym.month}
            {weekStart}
            {events}
            fontFamily={calendarFontFamily}
            color={calendarColor}
            weekendColor={calendarWeekendColor}
            gridStyle={calendarGridStyle}
            showHeading={true}
          />
        </div>
      </div>
    {/if}
  {/if}

  {#each texts as text (text.id)}
    {#if editingTextId !== text.id}
      <TextOverlay
        {text}
        {pagePaddingPx}
        interactive={!!onEditText}
        onClick={() => onEditText?.(text.id)}
      />
    {/if}
  {/each}

  <!-- Inline SVG color matrices for warmth/tint per slot. Zero-size,
       no layout impact. Only emitted for slots that actually shift color. -->
  <svg width="0" height="0" style="position: absolute; pointer-events: none;">
    <defs>
      {#each tpl.slots as _slotLayout, i}
        {@const slot = orderedSlots[i]}
        {@const t = slot ? effectiveTransform(slot, tpl.slots[i]) : IDENTITY_TRANSFORM}
        {#if hasColorShift(t)}
          <filter id="cm-{instanceId}-{i}" color-interpolation-filters="sRGB">
            <feColorMatrix type="matrix" values={svgColorMatrix(t)} />
          </filter>
        {/if}
      {/each}
    </defs>
  </svg>
</div>
