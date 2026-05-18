<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
  import PageControls from '$lib/components/PageControls.svelte';
  import SlotEditor from '$lib/components/SlotEditor.svelte';
  import TextEditor from '$lib/components/TextEditor.svelte';
  import { getTemplate } from '$lib/layout/templates';
  import { invalidateAll } from '$app/navigation';
  import { updateSlotPhoto, clearSlotPhoto, insertBlankPage, updateProjectSlotGap, updateProjectPagePadding, updateProjectPageBgColor, updateProjectPageAspect, updateProjectWeekStart, addPageText } from '$lib/db';
  import { DEFAULT_TEXT_STYLE, serializeStyle } from '$lib/text/style';

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
  let pageAspect = $state<'landscape' | 'portrait' | 'square' | null>(
    (data.project.page_aspect === 'landscape' || data.project.page_aspect === 'portrait' || data.project.page_aspect === 'square')
      ? data.project.page_aspect
      : null
  );

  async function onPageBgChange(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    pageBgColor = v;
    await updateProjectPageBgColor(data.project.id, v);
  }

  async function setPageAspect(a: 'landscape' | 'portrait' | 'square') {
    pageAspect = a;
    await updateProjectPageAspect(data.project.id, a);
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

  let inserting = $state(false);

  async function insertBlankBelow(idx: number) {
    if (!data.selection) return;
    inserting = true;
    try {
      await insertBlankPage({
        selection_id: data.selection.id,
        insert_at: idx + 1,
        template_id: 'cal-month',
      });
      await invalidateAll();
    } finally {
      inserting = false;
    }
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

<div class="container-page" style="max-width: 1000px;">
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
    <p class="text-sm mt-2" style="color: var(--color-muted)">
      {data.pages.length} pages · click any photo to swap, use the dropdown to change layout
    </p>
    <p class="text-sm mt-1 flex gap-3">
      <a class="btn-ghost" href={`/projects/${data.project.id}/calendar/export`}>export PDF →</a>
    </p>
    <label class="text-sm mt-2 flex items-center gap-2" style="color: var(--color-muted)">
      gap between images:
      <input type="range" min="0" max="40" step="1" value={slotGapPx} oninput={onGapChange} style="width: 160px;" />
      <span style="font-variant-numeric: tabular-nums; min-width: 3ch;">{slotGapPx}px</span>
    </label>
    <label class="text-sm mt-1 flex items-center gap-2" style="color: var(--color-muted)">
      page margin:
      <input type="range" min="0" max="60" step="1" value={pagePaddingPx} oninput={onPadChange} style="width: 160px;" />
      <span style="font-variant-numeric: tabular-nums; min-width: 3ch;">{pagePaddingPx}px</span>
    </label>
    <label class="text-sm mt-1 flex items-center gap-2" style="color: var(--color-muted)">
      page background:
      <input type="color" bind:value={pageBgColor} oninput={onPageBgChange} style="width: 32px; height: 24px; border: 1px solid var(--color-line); border-radius: 3px;" />
      <span style="font-family: var(--font-mono); font-size: 0.75rem;">{pageBgColor}</span>
    </label>
    <label class="text-sm mt-1 flex items-center gap-2" style="color: var(--color-muted)">
      page format:
      <button type="button" class={pageAspect === 'landscape' ? 'btn-primary' : 'btn-ghost'} style="font-size: 0.75rem; padding: 0.125rem 0.5rem;" onclick={() => setPageAspect('landscape')}>landscape</button>
      <button type="button" class={pageAspect === 'portrait' ? 'btn-primary' : 'btn-ghost'} style="font-size: 0.75rem; padding: 0.125rem 0.5rem;" onclick={() => setPageAspect('portrait')}>portrait</button>
      <button type="button" class={pageAspect === 'square' ? 'btn-primary' : 'btn-ghost'} style="font-size: 0.75rem; padding: 0.125rem 0.5rem;" onclick={() => setPageAspect('square')}>square</button>
    </label>
    <label class="text-sm mt-1 flex items-center gap-2" style="color: var(--color-muted)">
      week starts:
      <button
        type="button"
        class={weekStart === 1 ? 'btn-primary' : 'btn-ghost'}
        style="font-size: 0.75rem; padding: 0.125rem 0.5rem;"
        onclick={() => setWeekStart(1)}
      >Mon</button>
      <button
        type="button"
        class={weekStart === 0 ? 'btn-primary' : 'btn-ghost'}
        style="font-size: 0.75rem; padding: 0.125rem 0.5rem;"
        onclick={() => setWeekStart(0)}
      >Sun</button>
    </label>

    <div class="grid grid-cols-2 gap-4 mt-4">
      <button
        type="button"
        class="btn-secondary self-center col-span-2 justify-self-center mb-2"
        style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
        onclick={() => insertBlankBelow(-1)}
        disabled={inserting}
        title="Insert a blank cal-month page at the start"
      >
        + insert blank page at start
      </button>
      {#each data.pages as page, idx (page.id)}
        <section>
          <h2 class="text-sm font-medium mb-1" style="color: var(--color-muted)">
            {monthLabel(page.title)}
          </h2>
          <div class="relative">
            <PageView
              templateId={page.template_id}
              slots={data.slotsByPage.get(page.id) ?? []}
              onSlotClick={(i) => openPicker(page.id, i, page.title ?? '')}
              onSwapPhoto={(i) => openPicker(page.id, i, page.title ?? '')}
              onAdjustCrop={(i) => openEditor(page.id, i)}
              onRemovePhoto={(i) => removePhoto(page.id, i)}
              editingSlotIndex={editorOpen?.pageId === page.id ? editorOpen!.slotIndex : null}
              {slotGapPx}
              {pagePaddingPx}
              {pageBgColor}
              {pageAspect}
              slotCornerRadiusPx={data.project.slot_corner_radius_px}
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
          <div class="mt-1 flex items-center gap-2">
            <PageControls
              pageId={page.id}
              currentTemplateId={page.template_id}
              kind="calendar"
              isFirst={idx === 0}
              isLast={idx === data.pages.length - 1}
            />
            <button
              type="button"
              class="btn-secondary"
              style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
              onclick={() => addText(page.id)}
            >+ add text</button>
          </div>
        </section>
        <button
          type="button"
          class="btn-secondary self-center col-span-2 justify-self-center"
          style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
          onclick={() => insertBlankBelow(idx)}
          disabled={inserting}
          title="Insert a blank cal-month page after page {idx + 1}"
        >
          + insert blank page
        </button>
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
