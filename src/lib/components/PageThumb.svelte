<script lang="ts">
  import { getTemplate, type Template } from '$lib/layout/templates';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import TextOverlay from './TextOverlay.svelte';
  import type { PageTextRow } from '$lib/db/types';

  interface Slot {
    slot_index: number;
    photo_id: number | null;
    path: string | null;
    thumb_path: string | null;
  }

  interface Props {
    templateId: string;
    slots: Slot[];
    /** Fixed pixel width. Omit to fill the parent (width: 100%) — useful
     *  for responsive grids where the column already constrains size. */
    width?: number | null;
    texts?: PageTextRow[];
    /** Page-level visual settings — same semantics as PageView so sorter
     *  thumbs reflect the project's current style. Omitted = neutral
     *  defaults. */
    slotGapPx?: number;
    pagePaddingPx?: number;
    pageBgColor?: string;
    slotCornerRadiusPx?: number;
  }
  let {
    templateId,
    slots,
    width = null,
    texts = [],
    slotGapPx = 0,
    pagePaddingPx = 0,
    pageBgColor = '#ffffff',
    slotCornerRadiusPx = 0,
  }: Props = $props();

  let tpl = $derived<Template>(getTemplate(templateId));
  let aspectRatio = $derived(tpl.aspect === 'square' ? '1 / 1' : '4 / 3');
  let orderedSlots = $derived([...slots].sort((a, b) => a.slot_index - b.slot_index));
</script>

<!-- container-type: inline-size so cqi-based gap/padding/text-overlay
     sizing scales with the thumb, matching PageView's behavior. -->
<div
  class="relative overflow-hidden"
  style="
    width: {width === null ? '100%' : `${width}px`};
    aspect-ratio: {aspectRatio};
    background: {pageBgColor};
    border: 1px solid var(--color-line);
    pointer-events: none;
    container-type: inline-size;
  "
>
  {#each tpl.slots as slotLayout, i}
    {@const slot = orderedSlots[i]}
    {@const half = slotGapPx / 2}
    {@const padTop    = slotLayout.y <= 0.001 ? 0 : half}
    {@const padLeft   = slotLayout.x <= 0.001 ? 0 : half}
    {@const padBottom = slotLayout.y + slotLayout.h >= 0.999 ? 0 : half}
    {@const padRight  = slotLayout.x + slotLayout.w >= 0.999 ? 0 : half}
    <div
      class="absolute"
      style="
        left: calc({pagePaddingPx / 10}cqi + {slotLayout.x} * (100% - {pagePaddingPx / 5}cqi));
        top: calc({pagePaddingPx / 10}cqi + {slotLayout.y} * (100% - {pagePaddingPx / 5}cqi));
        width: calc({slotLayout.w} * (100% - {pagePaddingPx / 5}cqi));
        height: calc({slotLayout.h} * (100% - {pagePaddingPx / 5}cqi));
        padding: {padTop / 10}cqi {padRight / 10}cqi {padBottom / 10}cqi {padLeft / 10}cqi;
      "
    >
      <div class="w-full h-full overflow-hidden" style="background: var(--color-line); border-radius: {slotCornerRadiusPx}px;">
        {#if slot?.thumb_path}
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

  {#if tpl.calendarGrid}
    <div
      class="absolute"
      style="
        left: calc({pagePaddingPx / 10}cqi + {tpl.calendarGrid.x} * (100% - {pagePaddingPx / 5}cqi));
        top: calc({pagePaddingPx / 10}cqi + {tpl.calendarGrid.y} * (100% - {pagePaddingPx / 5}cqi));
        width: calc({tpl.calendarGrid.w} * (100% - {pagePaddingPx / 5}cqi));
        height: calc({tpl.calendarGrid.h} * (100% - {pagePaddingPx / 5}cqi));
        background: rgba(255,255,255,0.95);
        border: 1px solid var(--color-line);
      "
    >
      <div class="w-full h-full grid grid-cols-7 grid-rows-6" style="padding: 1px; gap: 1px;">
        {#each Array(42) as _}
          <div style="background: #d4d4d4; border-radius: 1px;"></div>
        {/each}
      </div>
    </div>
  {/if}

  {#each texts as text (text.id)}
    <TextOverlay {text} {pagePaddingPx} interactive={false} />
  {/each}
</div>
