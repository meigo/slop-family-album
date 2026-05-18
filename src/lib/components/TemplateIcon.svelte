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
    {@const cg = tpl.calendarGrid}
    {@const gridIsTall = cg.h > cg.w}
    {@const lineCount = gridIsTall ? 6 : 3}
    <!-- Inset the calendar block 10% on each side that's adjacent to a
         photo block (so lines + photos read as distinct shapes with a
         gap), but stay flush with the icon's outer edges where the grid
         already touches them (no double margin on the outer frame). -->
    {@const EPS = 0.001}
    {@const inT = cg.y > EPS ? '10%' : '0%'}
    {@const inB = cg.y + cg.h < 1 - EPS ? '10%' : '0%'}
    {@const inL = cg.x > EPS ? '10%' : '0%'}
    {@const inR = cg.x + cg.w < 1 - EPS ? '10%' : '0%'}
    <div
      class="absolute"
      style="
        left: calc({cg.x * 100}% + {inL});
        top: calc({cg.y * 100}% + {inT});
        width: calc({cg.w * 100}% - {inL} - {inR});
        height: calc({cg.h * 100}% - {inT} - {inB});
      "
    >
      {#each Array(lineCount) as _, i}
        {@const pct = (i / (lineCount - 1)) * 100}
        <!-- 2px line + translateY(-1px) so the line stays centered on the
             computed top % even when sub-pixel rounding nudges its
             position; 1px lines at fractional offsets render with mixed
             anti-aliasing and look inconsistent in width. -->
        <div style="position: absolute; left: 0; right: 0; top: {pct}%; height: 2px; transform: translateY(-1px); background: var(--color-muted); opacity: 0.8;"></div>
      {/each}
    </div>
  {/if}
</div>
