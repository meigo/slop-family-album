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
  }
  let { text, pagePaddingPx, onClose }: Props = $props();

  // Intentionally snapshot the prop's initial values into local $state — this
  // component edits a local copy and only writes back on save().
  // svelte-ignore state_referenced_locally
  let pos = $state({ x: text.position_x, y: text.position_y });
  // svelte-ignore state_referenced_locally
  let style = $state<TextStyle>(parseStyle(text.style_json) ?? DEFAULT_TEXT_STYLE);
  // svelte-ignore state_referenced_locally
  let content = $state(text.content);

  let dragging = $state(false);
  let dragStart: { mouseX: number; mouseY: number; pos: { x: number; y: number }; parentRect: DOMRect } | null = null;

  $effect(() => {
    loadGoogleFont(style.fontFamily, findFont(style.fontFamily)?.weights ?? [style.fontWeight]);
  });

  function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

  let wrapperEl: HTMLDivElement | undefined = $state(undefined);
  let editorEl: HTMLDivElement | undefined = $state(undefined);

  function onDragHandleDown(e: PointerEvent) {
    e.stopPropagation();
    if (!wrapperEl) return;
    dragging = true;
    const parentRect = wrapperEl.parentElement!.getBoundingClientRect();
    dragStart = { mouseX: e.clientX, mouseY: e.clientY, pos: { ...pos }, parentRect };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !dragStart) return;
    const dx = (e.clientX - dragStart.mouseX) / dragStart.parentRect.width;
    const dy = (e.clientY - dragStart.mouseY) / dragStart.parentRect.height;
    pos = {
      x: clamp01(dragStart.pos.x + dx),
      y: clamp01(dragStart.pos.y + dy),
    };
  }

  function onPointerUp(e: PointerEvent) {
    dragging = false;
    dragStart = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {
      // ignore: pointer may already be released
    }
  }

  async function save() {
    await updatePageText(text.id, {
      position_x: pos.x,
      position_y: pos.y,
      // Width/height are no longer manually controlled — text auto-sizes.
      // We still write them for storage compat; readers can ignore.
      width: 0,
      height: 0,
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

  // Sync initial content into the contentEditable element on mount and
  // focus + select-all so typing replaces the placeholder immediately.
  // innerText (not textContent) preserves multi-line round-trips.
  onMount(() => {
    if (!editorEl) return;
    editorEl.innerText = content;
    editorEl.focus();
    const range = document.createRange();
    range.selectNodeContents(editorEl);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });

  function onInput(e: Event) {
    content = (e.currentTarget as HTMLDivElement).innerText ?? '';
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<!-- The editor anchor: positioned at (pos.x, pos.y), sized by content.
     No outline, no resize handle, no drag bar — the text itself is the box.
     The toolbar floats above and carries the drag handle on its left. -->
<div
  bind:this={wrapperEl}
  class="absolute"
  style="
    left: calc({pagePaddingPx}px + {pos.x} * (100% - {2 * pagePaddingPx}px));
    top: calc({pagePaddingPx}px + {pos.y} * (100% - {2 * pagePaddingPx}px));
    max-width: calc({1 - pos.x} * (100% - {2 * pagePaddingPx}px));
    width: max-content;
    min-width: 30px;
    z-index: 5;
  "
>
  <!-- ContentEditable text. This is also the element whose rendered size
       drives snap-edge calculations. -->
  <div
    bind:this={editorEl}
    contenteditable="true"
    oninput={onInput}
    style="
      {cssForStyle(style)};
      outline: none;
      cursor: text;
      min-height: 1em;
    "
  ></div>

  <!-- Floating toolbar above the text. Drag handle on the left. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    style="
      position: absolute;
      bottom: 100%;
      left: 0;
      margin-bottom: 4px;
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
    onpointerdown={(e) => e.stopPropagation()}
  >
    <!-- Drag handle -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      onpointerdown={onDragHandleDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      title="Drag to move"
      style="
        padding: 2px 4px;
        cursor: {dragging ? 'grabbing' : 'grab'};
        font-size: 14px;
        line-height: 1;
        user-select: none;
        touch-action: none;
      "
    >⠿</div>

    <select title="Font family" bind:value={style.fontFamily} style="color: black; background: white; padding: 1px 2px; border: 1px solid #999; border-radius: 3px;">
      {#each FONT_CATALOG as f}
        <option value={f.family} style="font-family: '{f.family}', sans-serif;">{f.family}</option>
      {/each}
    </select>
    <input title="Font size (px)" type="number" min="8" max="200" bind:value={style.fontSize} style="width: 60px; color: black; background: white; padding: 1px 4px; border: 1px solid #999; border-radius: 3px;" />
    <select title="Font weight (thickness)" bind:value={style.fontWeight} style="color: black; background: white; padding: 1px 2px; border: 1px solid #999; border-radius: 3px;">
      {#each availableWeights as w}
        <option value={w}>{w}</option>
      {/each}
    </select>
    <input title="Line height" type="number" min="0.8" max="3" step="0.1" bind:value={style.lineHeight} style="width: 56px; color: black; background: white; padding: 1px 4px; border: 1px solid #999; border-radius: 3px;" />
    <button type="button" title="Italic" onclick={() => style.italic = !style.italic} style="padding: 2px 6px; background: {style.italic ? 'rgba(255,255,255,0.3)' : 'transparent'}; color: white; border: 1px solid white; border-radius: 3px;"><em>I</em></button>
    <input title="Text color" type="color" bind:value={style.color} style="width: 28px; height: 24px; border: none; background: transparent;" />
    <span title="Text alignment inside the box" style="opacity: 0.7; margin-left: 4px;">align</span>
    <button type="button" title="Align text left" onclick={() => style.align = 'left'} style="padding: 2px 6px; background: {style.align === 'left' ? 'rgba(255,255,255,0.3)' : 'transparent'}; color: white; border: 1px solid white; border-radius: 3px;">L</button>
    <button type="button" title="Center text" onclick={() => style.align = 'center'} style="padding: 2px 6px; background: {style.align === 'center' ? 'rgba(255,255,255,0.3)' : 'transparent'}; color: white; border: 1px solid white; border-radius: 3px;">C</button>
    <button type="button" title="Align text right" onclick={() => style.align = 'right'} style="padding: 2px 6px; background: {style.align === 'right' ? 'rgba(255,255,255,0.3)' : 'transparent'}; color: white; border: 1px solid white; border-radius: 3px;">R</button>

    <button type="button" title="Save changes" onclick={save} style="padding: 2px 8px; margin-left: 4px; background: white; color: black; border: none; border-radius: 3px;">save</button>
    <button type="button" title="Delete this text" onclick={remove} style="padding: 2px 6px; background: transparent; color: #ff8888; border: 1px solid #ff8888; border-radius: 3px;">del</button>
    <button type="button" title="Cancel (Esc)" onclick={onClose} style="padding: 2px 6px; background: transparent; color: white; border: 1px solid white; border-radius: 3px;">esc</button>
  </div>
</div>
