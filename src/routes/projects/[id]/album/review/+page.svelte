<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
  import PageControls from '$lib/components/PageControls.svelte';
  import SlotEditor from '$lib/components/SlotEditor.svelte';
  import TextEditor from '$lib/components/TextEditor.svelte';
  import { getTemplate } from '$lib/layout/templates';
  import { invalidateAll } from '$app/navigation';
  import { updateSlotPhoto, clearSlotPhoto, swapPageSlots, insertBlankPage, updateProjectSlotGap, updateProjectPagePadding, updateProjectPageBgColor, updateProjectPageSize, updateProjectSlotCornerRadius, updateProjectCalendarFontFamily, updateProjectCalendarColor, updateProjectStylePreset, addPageText } from '$lib/db';
  import { DEFAULT_TEXT_STYLE, serializeStyle } from '$lib/text/style';
  import { PAPER_PRESETS } from '$lib/print/presets';
  import { STYLE_PRESETS } from '$lib/print/style-presets';
  import { loadGoogleFont } from '$lib/text/fonts';
  import { LayoutGrid, FileText } from '@lucide/svelte';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let slotGapPx = $state(data.project.slot_gap_px);
  // svelte-ignore state_referenced_locally
  let pagePaddingPx = $state(data.project.page_padding_px);
  // svelte-ignore state_referenced_locally
  let pageBgColor = $state(data.project.page_bg_color);
  // svelte-ignore state_referenced_locally
  let pageWidthMm = $state(data.project.page_size_w_mm);
  // svelte-ignore state_referenced_locally
  let pageHeightMm = $state(data.project.page_size_h_mm);
  // svelte-ignore state_referenced_locally
  let slotCornerRadiusPx = $state(data.project.slot_corner_radius_px);
  // svelte-ignore state_referenced_locally
  let stylePresetId = $state<string>(data.project.style_preset_id ?? '');

  async function onPresetChange(e: Event) {
    const presetId = (e.currentTarget as HTMLSelectElement).value;
    if (!presetId) {
      stylePresetId = '';
      await updateProjectStylePreset(data.project.id, null);
      return;
    }
    const preset = STYLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    // Update local state FIRST so the preview reacts immediately,
    // then fire-and-await the DB writes in parallel.
    stylePresetId = presetId;
    slotGapPx = preset.slot_gap_px;
    pagePaddingPx = preset.page_padding_px;
    slotCornerRadiusPx = preset.slot_corner_radius_px;
    pageBgColor = preset.page_bg_color;
    if (preset.calendar_font_family) loadGoogleFont(preset.calendar_font_family);
    await Promise.all([
      updateProjectSlotGap(data.project.id, preset.slot_gap_px),
      updateProjectPagePadding(data.project.id, preset.page_padding_px),
      updateProjectSlotCornerRadius(data.project.id, preset.slot_corner_radius_px),
      updateProjectPageBgColor(data.project.id, preset.page_bg_color),
      updateProjectCalendarFontFamily(data.project.id, preset.calendar_font_family),
      updateProjectCalendarColor(data.project.id, preset.calendar_color),
      updateProjectStylePreset(data.project.id, presetId),
    ]);
    await invalidateAll();
  }

  async function onPageBgChange(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    pageBgColor = v;
    await updateProjectPageBgColor(data.project.id, v);
  }

  async function onPageSizeChange(e: Event) {
    const presetId = (e.currentTarget as HTMLSelectElement).value;
    const preset = PAPER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    pageWidthMm = preset.width_mm;
    pageHeightMm = preset.height_mm;
    await updateProjectPageSize(data.project.id, preset.width_mm, preset.height_mm);
  }

  let gapSavingTimer: ReturnType<typeof setTimeout> | null = null;
  function onGapChange(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    slotGapPx = v;
    if (gapSavingTimer) clearTimeout(gapSavingTimer);
    gapSavingTimer = setTimeout(async () => {
      await updateProjectSlotGap(data.project.id, v);
    }, 250);
  }

  let padSavingTimer: ReturnType<typeof setTimeout> | null = null;
  function onPadChange(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    pagePaddingPx = v;
    if (padSavingTimer) clearTimeout(padSavingTimer);
    padSavingTimer = setTimeout(async () => {
      await updateProjectPagePadding(data.project.id, v);
    }, 250);
  }

  let cornerSavingTimer: ReturnType<typeof setTimeout> | null = null;
  function onCornerChange(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    slotCornerRadiusPx = v;
    if (cornerSavingTimer) clearTimeout(cornerSavingTimer);
    cornerSavingTimer = setTimeout(async () => {
      await updateProjectSlotCornerRadius(data.project.id, v);
    }, 250);
  }

  let inserting = $state(false);

  async function insertBlankBelow(idx: number) {
    if (!data.selection) return;
    inserting = true;
    try {
      await insertBlankPage({
        selection_id: data.selection.id,
        insert_at: idx + 1,
        template_id: 'hero-1',
      });
      await invalidateAll();
    } finally {
      inserting = false;
    }
  }

  let pickerOpen = $state<null | { pageId: number; slotIndex: number; currentPhotoId: number | null }>(null);
  let editorOpen = $state<null | { pageId: number; slotIndex: number }>(null);

  function openPicker(pageId: number, slotIndex: number) {
    editorOpen = null;
    const slots = data.slotsByPage.get(pageId) ?? [];
    const slot = slots.find((s) => s.slot_index === slotIndex);
    pickerOpen = {
      pageId,
      slotIndex,
      currentPhotoId: slot?.photo_id ?? null,
    };
  }

  function openEditor(pageId: number, slotIndex: number) {
    pickerOpen = null;
    editingTextId = null;
    editorOpen = { pageId, slotIndex };
  }

  async function pickPhoto(photoId: number) {
    if (!pickerOpen) return;
    await updateSlotPhoto(pickerOpen.pageId, pickerOpen.slotIndex, photoId);
    pickerOpen = null;
    await invalidateAll();
  }

  async function swapSlots(pageId: number, slotA: number, slotB: number) {
    await swapPageSlots(pageId, slotA, slotB);
    await invalidateAll();
  }

  async function removePhoto(pageId: number, slotIndex: number) {
    if (!confirm('Remove this photo from the slot?')) return;
    await clearSlotPhoto(pageId, slotIndex);
    pickerOpen = null;
    editorOpen = null;
    await invalidateAll();
  }

  let editingTextId = $state<{ pageId: number; textId: number } | null>(null);

  function openTextEditor(pageId: number, textId: number) {
    pickerOpen = null;
    editorOpen = null;
    editingTextId = { pageId, textId };
  }

  async function addText(pageId: number) {
    const id = await addPageText({
      page_id: pageId,
      position_x: 0.1,
      position_y: 0.4,
      width: 0.8,
      height: 0.2,
      content: 'Tap to edit',
      style_json: serializeStyle(DEFAULT_TEXT_STYLE),
    });
    await invalidateAll();
    pickerOpen = null;
    editorOpen = null;
    editingTextId = { pageId, textId: id };
  }
</script>

<div class="container-page">
  <PageHeader backHref={`/projects/${data.project.id}`}>
    <h1 class="text-xl font-medium">{data.project.name} — album review</h1>
  </PageHeader>

  {#if !data.selection || data.pages.length === 0}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">
        No album generated yet. Return to the dashboard and click "Generate album".
      </p>
    </section>
  {:else}
    <p class="text-sm mt-1" style="color: var(--color-muted)">
      Review each page's auto-assembled layout. Hover any photo to swap or
      crop it, drop in text overlays, change templates via the icon picker,
      and reorder pages with the arrows. <strong>{data.pages.length}</strong>
      {data.pages.length === 1 ? 'page' : 'pages'}.
    </p>
    <div class="flex flex-wrap gap-2 mt-3">
      <a class="btn-secondary flex items-center gap-1" href={`/projects/${data.project.id}/album/sorter`}>
        <LayoutGrid size={16} /> Sorter view
      </a>
      <a class="btn-secondary flex items-center gap-1" href={`/projects/${data.project.id}/album/export`}>
        <FileText size={16} /> Export PDF
      </a>
    </div>
    <details open class="mt-3 settings-section">
      <summary>Page</summary>
      <div class="settings-body">
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          style preset:
          <select value={stylePresetId} onchange={onPresetChange} class="settings-select" title="Apply a bundle of gap, padding, corner radius, page background, and calendar font/color.">
            <option value="">— none / custom —</option>
            {#each STYLE_PRESETS as preset}
              <option value={preset.id} title={preset.description}>{preset.label}</option>
            {/each}
          </select>
        </label>
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          paper size:
          <select onchange={onPageSizeChange} class="settings-select">
            {#each ['landscape', 'portrait', 'square'] as group}
              <optgroup label={group}>
                {#each PAPER_PRESETS.filter((p) => p.group === group) as preset}
                  <option value={preset.id} selected={preset.width_mm === pageWidthMm && preset.height_mm === pageHeightMm}>{preset.label}</option>
                {/each}
              </optgroup>
            {/each}
          </select>
          <span style="font-variant-numeric: tabular-nums;">{pageWidthMm}×{pageHeightMm}mm</span>
        </label>
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          page margin:
          <input type="range" min="0" max="60" step="1" value={pagePaddingPx} oninput={onPadChange} style="width: 160px;" />
          <span style="font-variant-numeric: tabular-nums; min-width: 3ch;">{pagePaddingPx}px</span>
        </label>
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          gap between images:
          <input type="range" min="0" max="40" step="1" value={slotGapPx} oninput={onGapChange} style="width: 160px;" />
          <span style="font-variant-numeric: tabular-nums; min-width: 3ch;">{slotGapPx}px</span>
        </label>
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          slot corner radius:
          <input type="range" min="0" max="40" step="1" value={slotCornerRadiusPx} oninput={onCornerChange} style="width: 160px;" />
          <span style="font-variant-numeric: tabular-nums; min-width: 3ch;">{slotCornerRadiusPx}px</span>
        </label>
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          page background:
          <input type="color" bind:value={pageBgColor} oninput={onPageBgChange} style="width: 32px; height: 24px; border: 1px solid var(--color-line); border-radius: 3px;" />
          <span style="font-family: var(--font-mono); font-size: 0.75rem;">{pageBgColor}</span>
        </label>
      </div>
    </details>

    <div class="flex flex-col gap-6 mt-4">
      <button
        type="button"
        class="btn-secondary self-center mb-2"
        style="font-size: 0.8rem; padding: 0.5rem 0.875rem;"
        onclick={() => insertBlankBelow(-1)}
        disabled={inserting}
        title="Insert a blank hero-1 page at the start"
      >
        + insert blank page at start
      </button>
      {#each data.pages as page, idx (page.id)}
        <section>
          <div class="flex items-center justify-between gap-2 mb-2">
            <h2 class="text-sm font-medium" style="color: var(--color-muted)">
              Page {idx + 1}{page.title ? ` · ${page.title}` : ''}
            </h2>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="btn-secondary"
                style="font-size: 0.8rem; padding: 0.5rem 0.875rem;"
                onclick={() => addText(page.id)}
              >+ add text</button>
              <PageControls
                pageId={page.id}
                currentTemplateId={page.template_id}
                kind="album"
                isFirst={idx === 0}
                isLast={idx === data.pages.length - 1}
              />
            </div>
          </div>
          <div class="relative">
            <PageView
              templateId={page.template_id}
              slots={data.slotsByPage.get(page.id) ?? []}
              onSlotClick={(i) => openPicker(page.id, i)}
              onSwapPhoto={(i) => openPicker(page.id, i)}
              onAdjustCrop={(i) => openEditor(page.id, i)}
              onRemovePhoto={(i) => removePhoto(page.id, i)}
              onSwapSlots={(a, b) => swapSlots(page.id, a, b)}
              editingSlotIndex={editorOpen?.pageId === page.id ? editorOpen!.slotIndex : null}
              {slotGapPx}
              {pagePaddingPx}
              {pageBgColor}
              {pageWidthMm}
              {pageHeightMm}
              {slotCornerRadiusPx}
              texts={data.textsByPage.get(page.id) ?? []}
              editingTextId={editingTextId?.pageId === page.id ? editingTextId.textId : null}
              onEditText={(textId) => openTextEditor(page.id, textId)}
            />
            {#if editorOpen && editorOpen.pageId === page.id}
              {@const editorSlots = data.slotsByPage.get(page.id) ?? []}
              {@const editorSlot = editorSlots.find((s) => s.slot_index === editorOpen!.slotIndex)}
              {@const editorTpl = getTemplate(page.template_id)}
              {@const editorLayout = editorTpl.slots[editorOpen!.slotIndex]}
              {#if editorSlot?.path && editorSlot.photo_width !== null && editorSlot.photo_height !== null && editorLayout}
                {@const eHalf = slotGapPx / 2}
                {@const ePadTop    = editorLayout.y <= 0.001 ? 0 : eHalf}
                {@const ePadLeft   = editorLayout.x <= 0.001 ? 0 : eHalf}
                {@const ePadBottom = editorLayout.y + editorLayout.h >= 0.999 ? 0 : eHalf}
                {@const ePadRight  = editorLayout.x + editorLayout.w >= 0.999 ? 0 : eHalf}
                <div
                  class="absolute"
                  style="
                    left: calc({pagePaddingPx}px + {editorLayout.x} * (100% - {2 * pagePaddingPx}px));
                    top: calc({pagePaddingPx}px + {editorLayout.y} * (100% - {2 * pagePaddingPx}px));
                    width: calc({editorLayout.w} * (100% - {2 * pagePaddingPx}px));
                    height: calc({editorLayout.h} * (100% - {2 * pagePaddingPx}px));
                    padding: {ePadTop}px {ePadRight}px {ePadBottom}px {ePadLeft}px;
                    z-index: 4;
                  "
                >
                  <SlotEditor
                    pageId={page.id}
                    slotIndex={editorOpen.slotIndex}
                    photoPath={editorSlot.path}
                    photoWidth={editorSlot.photo_width}
                    photoHeight={editorSlot.photo_height}
                    initialTransformJson={editorSlot.transform_json}
                    slotLayout={editorLayout}
                    faces={editorSlot.faces}
                    topTag={editorSlot.top_tag}
                    onClose={() => editorOpen = null}
                  />
                </div>
              {/if}
            {/if}
            {#if editingTextId && editingTextId.pageId === page.id}
              {@const editingText = (data.textsByPage.get(page.id) ?? []).find((t) => t.id === editingTextId!.textId)}
              {#if editingText}
                <TextEditor
                  text={editingText}
                  {pagePaddingPx}
                  onClose={() => editingTextId = null}
                />
              {/if}
            {/if}
          </div>
        </section>
        <button
          type="button"
          class="btn-secondary self-center"
          style="font-size: 0.8rem; padding: 0.5rem 0.875rem;"
          onclick={() => insertBlankBelow(idx)}
          disabled={inserting}
          title="Insert a blank hero-1 page after page {idx + 1}"
        >
          + insert blank page
        </button>
      {/each}
    </div>
  {/if}

  {#if pickerOpen}
    <PhotoPicker
      projectId={data.project.id}
      kind="album"
      currentPhotoId={pickerOpen.currentPhotoId}
      onPick={pickPhoto}
      onClose={() => pickerOpen = null}
    />
  {/if}
</div>
