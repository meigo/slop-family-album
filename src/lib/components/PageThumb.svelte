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
    width: number;             // px
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
