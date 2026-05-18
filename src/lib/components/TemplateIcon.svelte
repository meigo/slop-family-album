<script lang="ts">
  import { getTemplate, type Template } from '$lib/layout/templates';

  interface Props {
    templateId: string;
    /** Pixel side length. Icons are always square — the schematic
     *  represents layout structure, not paper aspect. All positions
     *  inside are rounded to integer pixels so 1–2 px lines / gaps
     *  render sharply at any size. */
    width?: number;
  }
  let { templateId, width = 40 }: Props = $props();

  let tpl = $derived<Template>(getTemplate(templateId));

  /** Round a unit-coord into an integer pixel offset within the icon.
   *  Two slots that share an edge at the same unit-coord get the same
   *  snapped pixel, so adjacent rects line up exactly. */
  function snap(u: number): number {
    return Math.round(u * width);
  }
</script>

<!-- box-shadow inset draws the 1px frame *inside* the declared width/
     height without taking layout space (unlike border with border-box,
     which shrinks the content area and makes 100%-width children
     overflow the right + bottom). -->
<div
  class="relative inline-block"
  style="width: {width}px; height: {width}px; background: var(--color-surface); box-shadow: inset 0 0 0 1px var(--color-line); flex-shrink: 0;"
>
  {#each tpl.slots as slotLayout}
    {@const left = snap(slotLayout.x)}
    {@const top = snap(slotLayout.y)}
    {@const right = snap(slotLayout.x + slotLayout.w)}
    {@const bottom = snap(slotLayout.y + slotLayout.h)}
    {@const inT = top > 0 ? 1 : 0}
    {@const inL = left > 0 ? 1 : 0}
    {@const inB = bottom < width ? 1 : 0}
    {@const inR = right < width ? 1 : 0}
    <div
      class="absolute"
      style="
        left: {left + inL}px;
        top: {top + inT}px;
        width: {right - left - inL - inR}px;
        height: {bottom - top - inT - inB}px;
        background: var(--color-fg);
        opacity: 0.6;
      "
    ></div>
  {/each}
  {#if tpl.calendarGrid}
    {@const cg = tpl.calendarGrid}
    {@const gLeft = snap(cg.x)}
    {@const gTop = snap(cg.y)}
    {@const gRight = snap(cg.x + cg.w)}
    {@const gBottom = snap(cg.y + cg.h)}
    {@const insetPx = Math.max(2, Math.round(width * 0.1))}
    {@const cInT = gTop > 0 ? insetPx : 0}
    {@const cInL = gLeft > 0 ? insetPx : 0}
    {@const cInB = gBottom < width ? insetPx : 0}
    {@const cInR = gRight < width ? insetPx : 0}
    {@const blockH = gBottom - gTop - cInT - cInB}
    {@const lineCount = cg.h > cg.w ? 6 : 3}
    {@const lineThickness = 2}
    <div
      class="absolute"
      style="
        left: {gLeft + cInL}px;
        top: {gTop + cInT}px;
        width: {gRight - gLeft - cInL - cInR}px;
        height: {blockH}px;
      "
    >
      {#each Array(lineCount) as _, i}
        {@const linePos = Math.round((i * (blockH - lineThickness)) / (lineCount - 1))}
        <div style="position: absolute; left: 0; right: 0; top: {linePos}px; height: {lineThickness}px; background: var(--color-muted); opacity: 0.8;"></div>
      {/each}
    </div>
  {/if}
</div>
