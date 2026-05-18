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
    <!-- Inset the calendar block by 10% inside its bbox so the text lines
         and the photo blocks read as distinct elements with breathing
         room between them. Without the inset, lines and blocks touch
         and the icon looks crowded. -->
    <div
      class="absolute"
      style="
        left: calc({tpl.calendarGrid.x * 100}% + 10%);
        top: calc({tpl.calendarGrid.y * 100}% + 10%);
        width: calc({tpl.calendarGrid.w * 100}% - 20%);
        height: calc({tpl.calendarGrid.h * 100}% - 20%);
      "
    >
      {#each Array(lineCount) as _, i}
        {@const pct = (i / (lineCount - 1)) * 100}
        <div style="position: absolute; left: 0; right: 0; top: {pct}%; height: 1px; background: var(--color-muted); opacity: 0.8;"></div>
      {/each}
    </div>
  {/if}
</div>
