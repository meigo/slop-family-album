<script lang="ts">
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { parseTransform, serializeTransform, cssForTransform, type SlotTransform } from '$lib/layout/transform';
  import { autoPositionTransform } from '$lib/layout/autoposition';
  import { updateSlotTransform } from '$lib/db';
  import { invalidateAll } from '$app/navigation';
  import type { SlotLayout } from '$lib/layout/templates';
  import EmptySlotBg from './EmptySlotBg.svelte';

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
  class="absolute inset-0 overflow-hidden"
  style="touch-action: none; user-select: none; cursor: {dragging ? 'grabbing' : 'grab'};"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onwheel={onWheel}
  role="presentation"
>
  <EmptySlotBg />
  <img
    src={convertFileSrc(photoPath)}
    alt=""
    class="absolute inset-0 w-full h-full object-cover"
    style="object-position: {css.objectPosition}; transform: {css.transform}; transform-origin: {css.transformOrigin}; filter: {css.filter}; pointer-events: none;"
    draggable="false"
  />
  <!-- Floating toolbar pinned to the slot's bottom-left, inside the slot.
       Stop pointer events from bubbling to the drag surface — otherwise
       the surface captures the pointer on pointerdown and the button's
       click event never fires. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute bottom-1 left-1 flex"
    style="z-index: 3; background: rgba(0,0,0,0.7); padding: 4px 6px; border-radius: 6px; flex-direction: column; gap: 4px;"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
  >
    <div style="display: flex; gap: 6px; align-items: center; font-size: 11px; color: white;">
      <label title="Brightness — 1 is unchanged" style="display: flex; align-items: center; gap: 4px;">
        bright
        <input
          type="range" min="0.5" max="1.5" step="0.01"
          bind:value={t.brightness}
          style="width: 70px;"
        />
      </label>
      <label title="Contrast — 1 is unchanged" style="display: flex; align-items: center; gap: 4px;">
        contrast
        <input
          type="range" min="0.5" max="1.5" step="0.01"
          bind:value={t.contrast}
          style="width: 70px;"
        />
      </label>
      <label title="Saturation — 1 is unchanged" style="display: flex; align-items: center; gap: 4px;">
        sat
        <input
          type="range" min="0" max="2" step="0.01"
          bind:value={t.saturation}
          style="width: 70px;"
        />
      </label>
      <button
        type="button"
        onclick={() => { t.brightness = 1; t.contrast = 1; t.saturation = 1; }}
        title="Reset image adjustments"
        style="font-size: 11px; padding: 2px 6px; background: transparent; color: white; border: 1px solid white; border-radius: 3px;"
      >reset adj</button>
    </div>
    <div style="display: flex; gap: 4px; align-items: center;">
      <button type="button" class="text-xs" style="color: white; background: none; border: none; cursor: pointer; padding: 2px 4px;" onclick={save} title="Save crop">save</button>
      <button type="button" class="text-xs" style="color: white; background: none; border: none; cursor: pointer; padding: 2px 4px;" onclick={reset} title="Reset to auto">reset</button>
      <button type="button" class="text-xs" style="color: white; background: none; border: none; cursor: pointer; padding: 2px 4px;" onclick={onClose} title="Cancel (Esc)">cancel</button>
      <span class="text-xs" style="color: #ccc; margin-left: 4px; pointer-events: none;">
        {t.scale.toFixed(1)}× · {t.objectPositionX.toFixed(0)},{t.objectPositionY.toFixed(0)}
      </span>
    </div>
  </div>
</div>
