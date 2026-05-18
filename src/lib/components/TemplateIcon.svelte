<script lang="ts">
  import { getTemplate, type Template } from '$lib/layout/templates';

  interface Props {
    templateId: string;
    /** Pixel side length. Icons are always rendered square — the schematic
     *  represents layout structure, not paper aspect. */
    width?: number;
  }
  let { templateId, width = 40 }: Props = $props();

  let tpl = $derived<Template>(getTemplate(templateId));
</script>

<div
  class="relative inline-block"
  style="width: {width}px; height: {width}px; background: var(--color-surface); border: 1px solid var(--color-line); flex-shrink: 0;"
>
  {#each tpl.slots as slotLayout}
    <div
      class="absolute"
      style="
        left: {slotLayout.x * 100}%;
        top: {slotLayout.y * 100}%;
        width: {slotLayout.w * 100}%;
        height: {slotLayout.h * 100}%;
        background: var(--color-fg);
        opacity: 0.6;
        outline: 1px solid var(--color-surface);
        outline-offset: -1px;
      "
    ></div>
  {/each}
  {#if tpl.calendarGrid}
    {@const gridIsTall = tpl.calendarGrid.h > tpl.calendarGrid.w}
    {@const lineCount = gridIsTall ? 6 : 3}
    <div
      class="absolute"
      style="
        left: {tpl.calendarGrid.x * 100}%;
        top: {tpl.calendarGrid.y * 100}%;
        width: {tpl.calendarGrid.w * 100}%;
        height: {tpl.calendarGrid.h * 100}%;
        outline: 1px solid var(--color-surface);
        outline-offset: -1px;
      "
    >
      {#each Array(lineCount) as _, i}
        {@const pct = (i / (lineCount - 1)) * 100}
        <div style="position: absolute; left: 0; right: 0; top: {pct}%; height: 1px; background: var(--color-muted); opacity: 0.7; transform: translateY({i === lineCount - 1 ? '-1px' : '0'});"></div>
      {/each}
    </div>
  {/if}
</div>
