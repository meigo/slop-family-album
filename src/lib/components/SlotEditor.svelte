<script lang="ts">
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { parseTransform, serializeTransform, cssForTransform, hasColorShift, svgColorMatrix, type SlotTransform } from '$lib/layout/transform';
  import { autoPositionTransform } from '$lib/layout/autoposition';
  import { updateSlotTransform } from '$lib/db';
  import { invalidateAll } from '$app/navigation';
  import type { SlotLayout } from '$lib/layout/templates';
  import { Check, RotateCcw, X, SunMedium, Contrast, Droplets, Thermometer, Palette } from '@lucide/svelte';

  interface Props {
    pageId: number;
    slotIndex: number;
    photoPath: string;
    photoWidth: number;
    photoHeight: number;
    initialTransformJson: string | null;
    slotLayout: SlotLayout;
    faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
    topTag: string | null;
    onClose: () => void;
  }
  let { pageId, slotIndex, photoPath, photoWidth, photoHeight, initialTransformJson, slotLayout, faces, topTag, onClose }: Props = $props();

  function initialTransform(): SlotTransform {
    const parsed = parseTransform(initialTransformJson);
    if (parsed) return parsed;
    return autoPositionTransform({ photoWidth, photoHeight, faces, topTag, slot: slotLayout });
  }

  let t = $state<SlotTransform>(initialTransform());
  let dragging = $state(false);
  let dragStart: { x: number; y: number; t0: SlotTransform } | null = null;

  function clampPct(v: number): number {
    return Math.max(0, Math.min(100, v));
  }

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY, t0: { ...t } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const container = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Dragging right reveals more of the photo's LEFT side, so
    // object-position-x decreases. Hence the negation.
    t = {
      ...dragStart.t0,
      objectPositionX: clampPct(dragStart.t0.objectPositionX - (dx / container.width) * 100),
      objectPositionY: clampPct(dragStart.t0.objectPositionY - (dy / container.height) * 100),
    };
  }

  function onPointerUp(e: PointerEvent) {
    dragging = false;
    dragStart = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    const newScale = Math.max(1, Math.min(4, t.scale * (1 + delta)));
    t = { ...t, scale: newScale };
  }

  async function save() {
    await updateSlotTransform(pageId, slotIndex, serializeTransform(t));
    await invalidateAll();
    onClose();
  }

  async function reset() {
    await updateSlotTransform(pageId, slotIndex, null);
    await invalidateAll();
    onClose();
  }

  let css = $derived(cssForTransform(t));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="absolute inset-0"
  style="touch-action: none; user-select: none; cursor: {dragging ? 'grabbing' : 'grab'};"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onwheel={onWheel}
  role="presentation"
>
  <!-- Image container clips the photo to the slot bounds (img can be
       scaled past those bounds via the transform). The toolbar sibling
       below lives OUTSIDE this clip so it can wrap freely without being
       hidden. -->
  <div class="absolute inset-0 overflow-hidden">
    {#if hasColorShift(t)}
      <svg width="0" height="0" style="position: absolute; pointer-events: none;">
        <defs>
          <filter id="cm-editor-preview" color-interpolation-filters="sRGB">
            <feColorMatrix type="matrix" values={svgColorMatrix(t)} />
          </filter>
        </defs>
      </svg>
    {/if}
    <img
      src={convertFileSrc(photoPath)}
      alt=""
      class="absolute inset-0 w-full h-full object-cover"
      style="object-position: {css.objectPosition}; transform: {css.transform}; transform-origin: {css.transformOrigin}; filter: {css.filter}{hasColorShift(t) ? ' url(#cm-editor-preview)' : ''}; pointer-events: none;"
      draggable="false"
    />
  </div>
  <!-- Floating toolbar pinned bottom-left, sized to fit the slot width
       (left/right both set). Stop pointer events from bubbling to the
       drag surface so clicks/sliders work without starting a drag. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="toolbar toolbar-stack absolute"
    style="bottom: 4px; left: 4px; right: 4px; z-index: var(--z-toolbar);"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
  >
    <div class="toolbar-row">
      <div class="toolbar-row" title="Brightness — click icon to reset">
        <button type="button" class="toolbar-icon-btn" onclick={() => t.brightness = 1} title="Reset brightness" aria-label="Reset brightness">
          <SunMedium size={14} />
        </button>
        <input type="range" min="0.5" max="1.5" step="0.01" bind:value={t.brightness} aria-label="Brightness" style="width: 70px;" />
      </div>
      <div class="toolbar-row" title="Contrast — click icon to reset">
        <button type="button" class="toolbar-icon-btn" onclick={() => t.contrast = 1} title="Reset contrast" aria-label="Reset contrast">
          <Contrast size={14} />
        </button>
        <input type="range" min="0.5" max="1.5" step="0.01" bind:value={t.contrast} aria-label="Contrast" style="width: 70px;" />
      </div>
      <div class="toolbar-row" title="Saturation — click icon to reset">
        <button type="button" class="toolbar-icon-btn" onclick={() => t.saturation = 1} title="Reset saturation" aria-label="Reset saturation">
          <Droplets size={14} />
        </button>
        <input type="range" min="0" max="2" step="0.01" bind:value={t.saturation} aria-label="Saturation" style="width: 70px;" />
      </div>
      <div class="toolbar-row" title="Warmth — click icon to reset. Negative = cooler (blue), positive = warmer (orange).">
        <button type="button" class="toolbar-icon-btn" onclick={() => t.warmth = 0} title="Reset warmth" aria-label="Reset warmth">
          <Thermometer size={14} />
        </button>
        <input type="range" min="-1" max="1" step="0.01" bind:value={t.warmth} aria-label="Warmth" style="width: 70px;" />
      </div>
      <div class="toolbar-row" title="Tint — click icon to reset. Negative = magenta, positive = green.">
        <button type="button" class="toolbar-icon-btn" onclick={() => t.tint = 0} title="Reset tint" aria-label="Reset tint">
          <Palette size={14} />
        </button>
        <input type="range" min="-1" max="1" step="0.01" bind:value={t.tint} aria-label="Tint" style="width: 70px;" />
      </div>
      <button
        type="button"
        class="toolbar-btn"
        title="Reset all image adjustments"
        onclick={() => { t.brightness = 1; t.contrast = 1; t.saturation = 1; t.warmth = 0; t.tint = 0; }}
      >
        <RotateCcw size={12} /> all
      </button>
    </div>
    <div class="toolbar-row">
      <button type="button" class="toolbar-btn toolbar-btn-primary" onclick={save} title="Save crop">Save</button>
      <button type="button" class="toolbar-btn" onclick={reset} title="Reset crop to auto">
        <RotateCcw size={14} />
      </button>
      <button type="button" class="toolbar-btn" onclick={onClose} title="Cancel (Esc)">
        <X size={14} />
      </button>
      <span class="toolbar-label" style="margin-left: 4px; pointer-events: none;">
        {t.scale.toFixed(1)}× · {t.objectPositionX.toFixed(0)},{t.objectPositionY.toFixed(0)}
      </span>
    </div>
  </div>
</div>
