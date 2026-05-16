<script lang="ts">
  import { onMount } from 'svelte';
  import { parseStyle, serializeStyle, cssForStyle, DEFAULT_TEXT_STYLE, type TextStyle } from '$lib/text/style';
  import { loadGoogleFont } from '$lib/text/fonts';
  import { FONT_CATALOG, findFont } from '$lib/text/catalog';
  import { updatePageText, deletePageText } from '$lib/db';
  import { invalidateAll } from '$app/navigation';
  import type { PageTextRow } from '$lib/db/types';

  interface Props {
    text: PageTextRow;
    pagePaddingPx: number;
    onClose: () => void;
    /** Vertical lines (page-relative 0..1) the text edges/center can snap to. */
    snapTargetsX?: number[];
    /** Horizontal lines (page-relative 0..1) the text edges/center can snap to. */
    snapTargetsY?: number[];
  }
  let { text, pagePaddingPx, onClose, snapTargetsX = [0, 0.5, 1], snapTargetsY = [0, 0.5, 1] }: Props = $props();

  const SNAP_THRESHOLD = 0.012; // fractional — ~7px on a 600px-wide page

  // Intentionally snapshot the prop's initial values into local $state — this
  // component edits a local copy and only writes back on save(). The
  // state_referenced_locally warnings here are false positives.
  // svelte-ignore state_referenced_locally
  let pos = $state({ x: text.position_x, y: text.position_y, w: text.width, h: text.height });
  // svelte-ignore state_referenced_locally
  let style = $state<TextStyle>(parseStyle(text.style_json) ?? DEFAULT_TEXT_STYLE);
  // svelte-ignore state_referenced_locally
  let content = $state(text.content);

  let dragging = $state<'move' | 'resize' | null>(null);
  let dragStart: { mouseX: number; mouseY: number; pos: { x: number; y: number; w: number; h: number }; parentRect: DOMRect } | null = null;

  $effect(() => {
    loadGoogleFont(style.fontFamily, findFont(style.fontFamily)?.weights ?? [style.fontWeight]);
  });

  function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

  // Active snap targets — null = no snap active. Used to render guide lines.
  let activeSnapX = $state<number | null>(null);
  let activeSnapY = $state<number | null>(null);

  /** Find the closest snap target to any of the given candidate values.
   *  Returns the target value and the delta (target - winning candidate),
   *  or null if no candidate is within threshold. */
  function nearestSnap(targets: number[], candidates: number[]): { target: number; delta: number } | null {
    let best: { target: number; delta: number } | null = null;
    for (const t of targets) {
      for (const c of candidates) {
        const d = t - c;
        if (Math.abs(d) < SNAP_THRESHOLD && (best === null || Math.abs(d) < Math.abs(best.delta))) {
          best = { target: t, delta: d };
        }
      }
    }
    return best;
  }

  function onPointerDownMove(e: PointerEvent) {
    const tgt = e.target as HTMLElement;
    // Ignore drags that originate on the toolbar, resize handle, or contentEditable area
    if (tgt.closest('[data-toolbar]')) return;
    if (tgt.closest('[data-resize-handle]')) return;
    if (tgt.closest('[data-text-content]')) return;
    dragging = 'move';
    const parentRect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    dragStart = { mouseX: e.clientX, mouseY: e.clientY, pos: { ...pos }, parentRect };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerDownResize(e: PointerEvent) {
    e.stopPropagation();
    dragging = 'resize';
    const parentRect = (e.currentTarget as HTMLElement).parentElement!.parentElement!.getBoundingClientRect();
    dragStart = { mouseX: e.clientX, mouseY: e.clientY, pos: { ...pos }, parentRect };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !dragStart) return;
    const dx = (e.clientX - dragStart.mouseX) / dragStart.parentRect.width;
    const dy = (e.clientY - dragStart.mouseY) / dragStart.parentRect.height;

    if (dragging === 'move') {
      let nx = clamp01(dragStart.pos.x + dx);
      let ny = clamp01(dragStart.pos.y + dy);

      if (e.shiftKey) {
        // Bypass snap entirely.
        activeSnapX = null;
        activeSnapY = null;
      } else {
        // Snap candidates for X: text left, center, right.
        const sx = nearestSnap(snapTargetsX, [nx, nx + pos.w / 2, nx + pos.w]);
        if (sx) { nx = clamp01(nx + sx.delta); activeSnapX = sx.target; } else { activeSnapX = null; }
        // Snap candidates for Y: text top, center, bottom.
        const sy = nearestSnap(snapTargetsY, [ny, ny + pos.h / 2, ny + pos.h]);
        if (sy) { ny = clamp01(ny + sy.delta); activeSnapY = sy.target; } else { activeSnapY = null; }
      }

      pos = { x: nx, y: ny, w: pos.w, h: pos.h };
    } else {
      // Resize from bottom-right corner: only right and bottom edges move.
      let nw = clamp01(Math.max(0.05, dragStart.pos.w + dx));
      let nh = clamp01(Math.max(0.05, dragStart.pos.h + dy));

      if (e.shiftKey) {
        activeSnapX = null;
        activeSnapY = null;
      } else {
        const sx = nearestSnap(snapTargetsX, [pos.x + nw]);
        if (sx) { nw = clamp01(Math.max(0.05, nw + sx.delta)); activeSnapX = sx.target; } else { activeSnapX = null; }
        const sy = nearestSnap(snapTargetsY, [pos.y + nh]);
        if (sy) { nh = clamp01(Math.max(0.05, nh + sy.delta)); activeSnapY = sy.target; } else { activeSnapY = null; }
      }

      pos = { x: pos.x, y: pos.y, w: nw, h: nh };
    }
  }

  function onPointerUp(e: PointerEvent) {
    dragging = null;
    dragStart = null;
    activeSnapX = null;
    activeSnapY = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {
      // ignore: pointer may already be released
    }
  }

  async function save() {
    await updatePageText(text.id, {
      position_x: pos.x,
      position_y: pos.y,
      width: pos.w,
      height: pos.h,
      content,
      style_json: serializeStyle(style),
    });
    await invalidateAll();
    onClose();
  }

  async function remove() {
    if (!confirm('Delete this text?')) return;
    await deletePageText(text.id);
    await invalidateAll();
    onClose();
  }

  let availableWeights = $derived(findFont(style.fontFamily)?.weights ?? [400]);

  // 9-anchor snap. col/row are 0..2 for left/center/right and top/middle/bottom.
  function snapTo(col: 0 | 1 | 2, row: 0 | 1 | 2) {
    const x = col === 0 ? 0 : col === 2 ? 1 - pos.w : (1 - pos.w) / 2;
    const y = row === 0 ? 0 : row === 2 ? 1 - pos.h : (1 - pos.h) / 2;
    pos = { x: clamp01(x), y: clamp01(y), w: pos.w, h: pos.h };
  }

  function fullWidth() {
    pos = { x: 0, y: pos.y, w: 1, h: pos.h };
  }
  function fullHeight() {
    pos = { x: pos.x, y: 0, w: pos.w, h: 1 };
  }

  // Sync initial content into the contentEditable element on mount so the
  // caret doesn't reset on every reactive update.
  let editorEl: HTMLDivElement | undefined = $state(undefined);
  onMount(() => {
    if (editorEl) editorEl.textContent = content;
  });

  function onInput(e: Event) {
    content = (e.currentTarget as HTMLDivElement).textContent ?? '';
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<!-- Snap guide lines, positioned relative to the parent (the page wrapper).
     Rendered as a sibling of the editor box so the lines span the full page,
     not just the editor's bounds. -->
{#if activeSnapX !== null}
  <div
    style="
      position: absolute;
      left: calc({pagePaddingPx}px + {activeSnapX} * (100% - {2 * pagePaddingPx}px));
      top: 0; bottom: 0; width: 1px;
      background: #00bcd4;
      pointer-events: none;
      z-index: 8;
    "
  ></div>
{/if}
{#if activeSnapY !== null}
  <div
    style="
      position: absolute;
      top: calc({pagePaddingPx}px + {activeSnapY} * (100% - {2 * pagePaddingPx}px));
      left: 0; right: 0; height: 1px;
      background: #00bcd4;
      pointer-events: none;
      z-index: 8;
    "
  ></div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="absolute"
  style="
    left: calc({pagePaddingPx}px + {pos.x} * (100% - {2 * pagePaddingPx}px));
    top: calc({pagePaddingPx}px + {pos.y} * (100% - {2 * pagePaddingPx}px));
    width: calc({pos.w} * (100% - {2 * pagePaddingPx}px));
    height: calc({pos.h} * (100% - {2 * pagePaddingPx}px));
    z-index: 5;
    outline: 1px dashed var(--color-fg);
    cursor: {dragging === 'move' ? 'grabbing' : 'grab'};
    touch-action: none;
  "
  onpointerdown={onPointerDownMove}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  role="presentation"
>
  <div
    data-text-content
    bind:this={editorEl}
    contenteditable="true"
    oninput={onInput}
    class="w-full h-full"
    style="{cssForStyle(style)}; outline: none; overflow: hidden; cursor: text;"
  ></div>

  <!-- Resize handle, bottom-right -->
  <div
    data-resize-handle
    onpointerdown={onPointerDownResize}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    style="
      position: absolute;
      right: -6px; bottom: -6px;
      width: 12px; height: 12px;
      background: var(--color-fg);
      border-radius: 50%;
      cursor: nwse-resize;
      z-index: 6;
    "
  ></div>

  <!-- Floating toolbar -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    data-toolbar
    onpointerdown={(e) => e.stopPropagation()}
    style="
      position: absolute;
      top: -36px;
      left: 0;
      display: flex;
      gap: 4px;
      align-items: center;
      background: rgba(0,0,0,0.85);
      color: white;
      padding: 4px 6px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 7;
      white-space: nowrap;
    "
  >
    <select bind:value={style.fontFamily} style="color: black; background: white; padding: 1px 2px; border: 1px solid #999; border-radius: 3px;">
      {#each FONT_CATALOG as f}
        <option value={f.family} style="font-family: '{f.family}', sans-serif;">{f.family}</option>
      {/each}
    </select>
    <input type="number" min="8" max="200" bind:value={style.fontSize} style="width: 60px; color: black; background: white; padding: 1px 4px; border: 1px solid #999; border-radius: 3px;" />
    <select bind:value={style.fontWeight} style="color: black; background: white; padding: 1px 2px; border: 1px solid #999; border-radius: 3px;">
      {#each availableWeights as w}
        <option value={w}>{w}</option>
      {/each}
    </select>
    <button type="button" onclick={() => style.italic = !style.italic} style="padding: 2px 6px; background: {style.italic ? 'rgba(255,255,255,0.3)' : 'transparent'}; color: white; border: 1px solid white; border-radius: 3px;"><em>I</em></button>
    <input type="color" bind:value={style.color} style="width: 28px; height: 24px; border: none; background: transparent;" />
    <button type="button" onclick={() => style.align = 'left'} style="padding: 2px 6px; background: {style.align === 'left' ? 'rgba(255,255,255,0.3)' : 'transparent'}; color: white; border: 1px solid white; border-radius: 3px;">L</button>
    <button type="button" onclick={() => style.align = 'center'} style="padding: 2px 6px; background: {style.align === 'center' ? 'rgba(255,255,255,0.3)' : 'transparent'}; color: white; border: 1px solid white; border-radius: 3px;">C</button>
    <button type="button" onclick={() => style.align = 'right'} style="padding: 2px 6px; background: {style.align === 'right' ? 'rgba(255,255,255,0.3)' : 'transparent'}; color: white; border: 1px solid white; border-radius: 3px;">R</button>

    <!-- 9-anchor snap grid -->
    <div title="Snap to anchor" style="display: inline-grid; grid-template-columns: repeat(3, 12px); grid-template-rows: repeat(3, 12px); gap: 1px; border: 1px solid white; padding: 1px; border-radius: 3px;">
      {#each [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]] as [c, r]}
        <button
          type="button"
          onclick={() => snapTo(c as 0|1|2, r as 0|1|2)}
          aria-label={`Snap col ${c} row ${r}`}
          style="width: 12px; height: 12px; padding: 0; background: rgba(255,255,255,0.25); border: none; border-radius: 1px;"
        ></button>
      {/each}
    </div>
    <button type="button" onclick={fullWidth} title="Stretch full width" style="padding: 2px 4px; background: transparent; color: white; border: 1px solid white; border-radius: 3px;">↔</button>
    <button type="button" onclick={fullHeight} title="Stretch full height" style="padding: 2px 4px; background: transparent; color: white; border: 1px solid white; border-radius: 3px;">↕</button>

    <button type="button" onclick={save} style="padding: 2px 8px; background: white; color: black; border: none; border-radius: 3px;">save</button>
    <button type="button" onclick={remove} style="padding: 2px 6px; background: transparent; color: #ff8888; border: 1px solid #ff8888; border-radius: 3px;">del</button>
    <button type="button" onclick={onClose} style="padding: 2px 6px; background: transparent; color: white; border: 1px solid white; border-radius: 3px;">esc</button>
  </div>
</div>
