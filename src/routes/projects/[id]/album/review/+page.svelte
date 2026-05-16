<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
  import PageControls from '$lib/components/PageControls.svelte';
  import SlotEditor from '$lib/components/SlotEditor.svelte';
  import TextEditor from '$lib/components/TextEditor.svelte';
  import { getTemplate } from '$lib/layout/templates';
  import { invalidateAll } from '$app/navigation';
  import { updateSlotPhoto, insertBlankPage, updateProjectSlotGap, updateProjectPagePadding, addPageText } from '$lib/db';
  import { DEFAULT_TEXT_STYLE, serializeStyle } from '$lib/text/style';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let slotGapPx = $state(data.project.slot_gap_px);
  // svelte-ignore state_referenced_locally
  let pagePaddingPx = $state(data.project.page_padding_px);

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

  let editingTextId = $state<{ pageId: number; textId: number } | null>(null);

  function openTextEditor(pageId: number, textId: number) {
    pickerOpen = null;
    editorOpen = null;
    editingTextId = { pageId, textId };
  }

  function snapTargetsFor(templateId: string): { x: number[]; y: number[] } {
    const tpl = getTemplate(templateId);
    const xs = new Set<number>([0, 0.5, 1]);
    const ys = new Set<number>([0, 0.5, 1]);
    for (const s of tpl.slots) {
      xs.add(s.x); xs.add(s.x + s.w);
      ys.add(s.y); ys.add(s.y + s.h);
    }
    if (tpl.calendarGrid) {
      xs.add(tpl.calendarGrid.x); xs.add(tpl.calendarGrid.x + tpl.calendarGrid.w);
      ys.add(tpl.calendarGrid.y); ys.add(tpl.calendarGrid.y + tpl.calendarGrid.h);
    }
    return { x: [...xs].sort((a, b) => a - b), y: [...ys].sort((a, b) => a - b) };
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
    <h1 class="text-xl font-medium">{data.project.name} — album review</h1>
  </PageHeader>

  {#if !data.selection || data.pages.length === 0}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">
        No album generated yet. Return to the dashboard and click "Generate album".
      </p>
    </section>
  {:else}
    <p class="text-sm mt-2" style="color: var(--color-muted)">
      {data.pages.length} pages · click any photo to swap, use the dropdown to change layout
    </p>
    <p class="text-sm mt-1">
      <a class="btn-ghost" href={`/projects/${data.project.id}/album/sorter`}>open sorter view →</a>
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

    <div class="flex flex-col gap-6 mt-4">
      <button
        type="button"
        class="btn-secondary self-center mb-2"
        style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
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
                style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
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
              editingSlotIndex={editorOpen?.pageId === page.id ? editorOpen!.slotIndex : null}
              {slotGapPx}
              {pagePaddingPx}
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
                <div
                  class="absolute"
                  style="
                    left: calc({pagePaddingPx}px + {editorLayout.x} * (100% - {2 * pagePaddingPx}px));
                    top: calc({pagePaddingPx}px + {editorLayout.y} * (100% - {2 * pagePaddingPx}px));
                    width: calc({editorLayout.w} * (100% - {2 * pagePaddingPx}px));
                    height: calc({editorLayout.h} * (100% - {2 * pagePaddingPx}px));
                    padding: {slotGapPx / 2}px;
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
              {@const snaps = snapTargetsFor(page.template_id)}
              {#if editingText}
                <TextEditor
                  text={editingText}
                  {pagePaddingPx}
                  snapTargetsX={snaps.x}
                  snapTargetsY={snaps.y}
                  onClose={() => editingTextId = null}
                />
              {/if}
            {/if}
          </div>
        </section>
        <button
          type="button"
          class="btn-secondary self-center"
          style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
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
