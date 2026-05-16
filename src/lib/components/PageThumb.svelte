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
    width: number;             // px
    texts?: PageTextRow[];
  }
  let { templateId, slots, width, texts = [] }: Props = $props();

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
        left: {tpl.calendarGrid.x * 100}%;
        top: {tpl.calendarGrid.y * 100}%;
        width: {tpl.calendarGrid.w * 100}%;
        height: {tpl.calendarGrid.h * 100}%;
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
    <TextOverlay {text} pagePaddingPx={0} interactive={false} />
  {/each}
</div>
