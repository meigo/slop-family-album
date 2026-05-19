<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
  import PageControls from '$lib/components/PageControls.svelte';
  import SlotEditor from '$lib/components/SlotEditor.svelte';
  import TextEditor from '$lib/components/TextEditor.svelte';
  import { getTemplate } from '$lib/layout/templates';
  import { invalidateAll } from '$app/navigation';
  import { updateSlotPhoto, clearSlotPhoto, swapPageSlots, updateProjectSlotGap, updateProjectPagePadding, updateProjectPageBgColor, updateProjectCalendarPageSize, updateProjectWeekStart, updateProjectCalendarFontFamily, updateProjectCalendarColor, updateProjectCalendarGridStyle, updateProjectCalendarWeekendColor, updateProjectCalendarSlotCornerRadius, updateProjectStylePreset, type CalendarGridStyle, addPageText } from '$lib/db';
  import { DEFAULT_TEXT_STYLE, serializeStyle } from '$lib/text/style';
  import { PAPER_PRESETS } from '$lib/print/presets';
  import { STYLE_PRESETS } from '$lib/print/style-presets';
  import { FONT_CATALOG } from '$lib/text/catalog';
  import { loadGoogleFont } from '$lib/text/fonts';
  import { onMount } from 'svelte';
  import { FileText, SlidersHorizontal } from '@lucide/svelte';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let slotGapPx = $state(data.project.slot_gap_px);
  // svelte-ignore state_referenced_locally
  let pagePaddingPx = $state(data.project.page_padding_px);
  // svelte-ignore state_referenced_locally
  let weekStart = $state<0 | 1>(data.project.week_start === 0 ? 0 : 1);
  // svelte-ignore state_referenced_locally
  let pageBgColor = $state(data.project.page_bg_color);
  // svelte-ignore state_referenced_locally
  let pageWidthMm = $state(data.project.calendar_page_size_w_mm);
  // svelte-ignore state_referenced_locally
  let pageHeightMm = $state(data.project.calendar_page_size_h_mm);
  // svelte-ignore state_referenced_locally
  let slotCornerRadiusPx = $state(data.project.calendar_slot_corner_radius_px);
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
    // Update local state immediately so the preview reflects the
    // preset on the next paint, then fan-out the DB writes.
    stylePresetId = presetId;
    slotGapPx = preset.slot_gap_px;
    pagePaddingPx = preset.page_padding_px;
    slotCornerRadiusPx = preset.slot_corner_radius_px;
    pageBgColor = preset.page_bg_color;
    calendarFontFamily = preset.calendar_font_family;
    calendarColor = preset.calendar_color;
    if (preset.calendar_font_family) loadGoogleFont(preset.calendar_font_family);
    await Promise.all([
      updateProjectSlotGap(data.project.id, preset.slot_gap_px),
      updateProjectPagePadding(data.project.id, preset.page_padding_px),
      updateProjectCalendarSlotCornerRadius(data.project.id, preset.slot_corner_radius_px),
      updateProjectPageBgColor(data.project.id, preset.page_bg_color),
      updateProjectCalendarFontFamily(data.project.id, preset.calendar_font_family),
      updateProjectCalendarColor(data.project.id, preset.calendar_color),
      updateProjectStylePreset(data.project.id, presetId),
    ]);
  }
  // svelte-ignore state_referenced_locally
  let calendarFontFamily = $state<string | null>(data.project.calendar_font_family);
  // svelte-ignore state_referenced_locally
  let calendarColor = $state(data.project.calendar_color);
  // svelte-ignore state_referenced_locally
  let calendarGridStyle = $state<CalendarGridStyle>(
    (data.project.calendar_grid_style === 'grid' || data.project.calendar_grid_style === 'lines' || data.project.calendar_grid_style === 'none')
      ? data.project.calendar_grid_style
      : 'boxed'
  );

  async function setCalendarGridStyle(style: CalendarGridStyle) {
    calendarGridStyle = style;
    await updateProjectCalendarGridStyle(data.project.id, style);
  }

  // Preload the saved font on mount so the first paint already has it.
  onMount(() => {
    if (calendarFontFamily) loadGoogleFont(calendarFontFamily);
  });

  async function onCalendarFontChange(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    const next = v === '' ? null : v;
    if (next) loadGoogleFont(next);
    calendarFontFamily = next;
    await updateProjectCalendarFontFamily(data.project.id, next);
  }

  async function onCalendarColorChange(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    calendarColor = v;
    await updateProjectCalendarColor(data.project.id, v);
  }

  // svelte-ignore state_referenced_locally
  let calendarWeekendColor = $state(data.project.calendar_weekend_color);

  async function onCalendarWeekendColorChange(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    calendarWeekendColor = v;
    await updateProjectCalendarWeekendColor(data.project.id, v);
  }

  let cornerSavingTimer: ReturnType<typeof setTimeout> | null = null;
  function onCornerChange(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    slotCornerRadiusPx = v;
    if (cornerSavingTimer) clearTimeout(cornerSavingTimer);
    cornerSavingTimer = setTimeout(async () => {
      await updateProjectCalendarSlotCornerRadius(data.project.id, v);
    }, 250);
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
    await updateProjectCalendarPageSize(data.project.id, preset.width_mm, preset.height_mm);
  }

  async function setWeekStart(v: 0 | 1) {
    weekStart = v;
    await updateProjectWeekStart(data.project.id, v);
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

  let pickerOpen = $state<null | { pageId: number; slotIndex: number; bucketKey: string; currentPhotoId: number | null }>(null);
  let editorOpen = $state<null | { pageId: number; slotIndex: number }>(null);

  function monthLabel(bucketKey: string | null): string {
    if (!bucketKey) return '';
    const d = new Date(bucketKey + '-15T12:00:00');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }

  function openPicker(pageId: number, slotIndex: number, bucketKey: string) {
    editorOpen = null;
    const slots = data.slotsByPage.get(pageId) ?? [];
    const slot = slots.find((s) => s.slot_index === slotIndex);
    pickerOpen = {
      pageId, slotIndex, bucketKey,
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
    <h1 class="text-xl font-medium">{data.project.name} — calendar review</h1>
  </PageHeader>

  {#if !data.selection || data.pages.length === 0}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">
        No calendar generated yet. Return to the dashboard and click "Generate calendar".
      </p>
    </section>
  {:else}
    <p class="text-sm mt-1" style="color: var(--color-muted)">
      Twelve months, one page per month. Pick photos, change the per-page
      layout, tweak the grid style, font, and weekend color. Add text
      overlays anywhere on a page.
    </p>
    <div class="flex flex-wrap gap-2 mt-3">
      <a class="btn-secondary flex items-center gap-1" href={`/projects/${data.project.id}/calendar/export`}>
        <FileText size={16} /> Export PDF
      </a>
    </div>
    <details open class="mt-3 settings-section">
      <summary><SlidersHorizontal size={14} aria-hidden="true" /> Page</summary>
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

    <details class="mt-4 settings-section">
      <summary><SlidersHorizontal size={14} aria-hidden="true" /> Calendar grid</summary>
      <div class="settings-body">
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          grid style:
          <button type="button" class={calendarGridStyle === 'boxed' ? 'btn-primary' : 'btn-ghost'} style="font-size: 0.75rem; padding: 0.125rem 0.5rem;" onclick={() => setCalendarGridStyle('boxed')}>boxed</button>
          <button type="button" class={calendarGridStyle === 'grid' ? 'btn-primary' : 'btn-ghost'} style="font-size: 0.75rem; padding: 0.125rem 0.5rem;" onclick={() => setCalendarGridStyle('grid')}>grid</button>
          <button type="button" class={calendarGridStyle === 'lines' ? 'btn-primary' : 'btn-ghost'} style="font-size: 0.75rem; padding: 0.125rem 0.5rem;" onclick={() => setCalendarGridStyle('lines')}>lines</button>
          <button type="button" class={calendarGridStyle === 'none' ? 'btn-primary' : 'btn-ghost'} style="font-size: 0.75rem; padding: 0.125rem 0.5rem;" onclick={() => setCalendarGridStyle('none')}>none</button>
        </label>
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          text + grid color:
          <input type="color" bind:value={calendarColor} oninput={onCalendarColorChange} style="width: 32px; height: 24px; border: 1px solid var(--color-line); border-radius: 3px;" />
          <span style="font-family: var(--font-mono); font-size: 0.75rem;">{calendarColor}</span>
        </label>
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          Sunday color:
          <input type="color" bind:value={calendarWeekendColor} oninput={onCalendarWeekendColorChange} style="width: 32px; height: 24px; border: 1px solid var(--color-line); border-radius: 3px;" />
          <span style="font-family: var(--font-mono); font-size: 0.75rem;">{calendarWeekendColor}</span>
        </label>
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          font:
          <select onchange={onCalendarFontChange} class="settings-select">
            <option value="" selected={calendarFontFamily === null}>App default (mono)</option>
            {#each ['sans-serif', 'serif', 'handwriting', 'display', 'monospace'] as category}
              <optgroup label={category}>
                {#each FONT_CATALOG.filter((f) => f.category === category) as font}
                  <option value={font.family} selected={font.family === calendarFontFamily}>{font.family}</option>
                {/each}
              </optgroup>
            {/each}
          </select>
        </label>
        <label class="text-sm flex items-center gap-2" style="color: var(--color-muted)">
          week starts:
          <button type="button" class={weekStart === 1 ? 'btn-primary' : 'btn-ghost'} style="font-size: 0.75rem; padding: 0.125rem 0.5rem;" onclick={() => setWeekStart(1)}>Mon</button>
          <button type="button" class={weekStart === 0 ? 'btn-primary' : 'btn-ghost'} style="font-size: 0.75rem; padding: 0.125rem 0.5rem;" onclick={() => setWeekStart(0)}>Sun</button>
        </label>
      </div>
    </details>

    <div class="flex flex-col gap-12 mt-12">
      {#each data.pages as page, idx (page.id)}
        <section>
          <div class="flex items-center justify-between gap-2 mb-2">
            <h2 class="text-sm font-medium" style="color: var(--color-muted)">
              {monthLabel(page.title)}
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
                kind="calendar"
                isFirst={idx === 0}
                isLast={idx === data.pages.length - 1}
              />
            </div>
          </div>
          <div class="relative" style="container-type: inline-size;">
            <PageView
              templateId={page.template_id}
              slots={data.slotsByPage.get(page.id) ?? []}
              onSlotClick={(i) => openPicker(page.id, i, page.title ?? '')}
              onSwapPhoto={(i) => openPicker(page.id, i, page.title ?? '')}
              onAdjustCrop={(i) => openEditor(page.id, i)}
              onRemovePhoto={(i) => removePhoto(page.id, i)}
              onSwapSlots={(a, b) => swapSlots(page.id, a, b)}
              editingSlotIndex={editorOpen?.pageId === page.id ? editorOpen!.slotIndex : null}
              {slotGapPx}
              {pagePaddingPx}
              {pageBgColor}
              {pageWidthMm}
              {pageHeightMm}
              {calendarFontFamily}
              {calendarColor}
              {calendarWeekendColor}
              {calendarGridStyle}
              {slotCornerRadiusPx}
              pageTitle={page.title}
              events={data.events}
              {weekStart}
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
                    left: calc({pagePaddingPx / 10}cqi + {editorLayout.x} * (100% - {pagePaddingPx / 5}cqi));
                    top: calc({pagePaddingPx / 10}cqi + {editorLayout.y} * (100% - {pagePaddingPx / 5}cqi));
                    width: calc({editorLayout.w} * (100% - {pagePaddingPx / 5}cqi));
                    height: calc({editorLayout.h} * (100% - {pagePaddingPx / 5}cqi));
                    padding: {ePadTop / 10}cqi {ePadRight / 10}cqi {ePadBottom / 10}cqi {ePadLeft / 10}cqi;
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
      {/each}
    </div>
  {/if}

  {#if pickerOpen}
    <PhotoPicker
      projectId={data.project.id}
      kind="calendar"
      sourceYear={data.project.calendar_year - 1}
      bucketKey={pickerOpen.bucketKey}
      currentPhotoId={pickerOpen.currentPhotoId}
      onPick={pickPhoto}
      onClose={() => pickerOpen = null}
    />
  {/if}
</div>
