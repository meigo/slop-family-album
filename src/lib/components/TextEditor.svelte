<script lang="ts">
  import { onMount } from 'svelte';
  import { parseStyle, serializeStyle, cssForStyle, DEFAULT_TEXT_STYLE, type TextStyle } from '$lib/text/style';
  import { loadGoogleFont } from '$lib/text/fonts';
  import { FONT_CATALOG, findFont } from '$lib/text/catalog';
  import { updatePageText, deletePageText } from '$lib/db';
  import { invalidateAll } from '$app/navigation';
  import type { PageTextRow } from '$lib/db/types';
  import { GripVertical, Italic, AlignLeft, AlignCenter, AlignRight, Trash2, X } from '@lucide/svelte';

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
    class="toolbar"
    style="position: absolute; bottom: 100%; left: 0; margin-bottom: 4px; z-index: var(--z-toolbar);"
    onpointerdown={(e) => e.stopPropagation()}
  >
    <!-- Drag handle (a div, not a button, so it can capture pointer events
         and not steal focus from the contentEditable) -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="toolbar-icon-btn"
      onpointerdown={onDragHandleDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      title="Drag to move"
      role="button"
      tabindex="-1"
      style="cursor: {dragging ? 'grabbing' : 'grab'}; touch-action: none; user-select: none;"
    >
      <GripVertical size={16} />
    </div>

    <select class="toolbar-field" title="Font family" bind:value={style.fontFamily}>
      {#each FONT_CATALOG as f}
        <option value={f.family} style="font-family: '{f.family}', sans-serif;">{f.family}</option>
      {/each}
    </select>
    <input class="toolbar-field" title="Font size (px)" type="number" min="8" max="200" bind:value={style.fontSize} style="width: 56px;" />
    <select class="toolbar-field" title="Font weight (thickness)" bind:value={style.fontWeight}>
      {#each availableWeights as w}
        <option value={w}>{w}</option>
      {/each}
    </select>
    <input class="toolbar-field" title="Line height" type="number" min="0.8" max="3" step="0.1" bind:value={style.lineHeight} style="width: 52px;" />
    <button type="button" class="toolbar-btn" class:active={style.italic} title="Italic" onclick={() => style.italic = !style.italic}>
      <Italic size={14} />
    </button>
    <input class="toolbar-field-color" title="Text color" type="color" bind:value={style.color} />
    <span class="toolbar-label" title="Text alignment inside the box" style="margin-left: 4px;">align</span>
    <button type="button" class="toolbar-btn" class:active={style.align === 'left'} title="Align text left" onclick={() => style.align = 'left'}>
      <AlignLeft size={14} />
    </button>
    <button type="button" class="toolbar-btn" class:active={style.align === 'center'} title="Center text" onclick={() => style.align = 'center'}>
      <AlignCenter size={14} />
    </button>
    <button type="button" class="toolbar-btn" class:active={style.align === 'right'} title="Align text right" onclick={() => style.align = 'right'}>
      <AlignRight size={14} />
    </button>

    <button type="button" class="toolbar-btn toolbar-btn-primary" title="Save changes" onclick={save} style="margin-left: 4px;">Save</button>
    <button type="button" class="toolbar-btn toolbar-btn-danger" title="Delete this text" onclick={remove}>
      <Trash2 size={14} />
    </button>
    <button type="button" class="toolbar-btn" title="Cancel (Esc)" onclick={onClose}>
      <X size={14} />
    </button>
  </div>
</div>
