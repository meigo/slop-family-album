<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
  import PageControls from '$lib/components/PageControls.svelte';
  import SlotEditor from '$lib/components/SlotEditor.svelte';
  import { getTemplate } from '$lib/layout/templates';
  import { invalidateAll } from '$app/navigation';
  import { updateSlotPhoto, insertBlankPage } from '$lib/db';

  let { data } = $props();

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
    editorOpen = { pageId, slotIndex };
  }

  async function pickPhoto(photoId: number) {
    if (!pickerOpen) return;
    await updateSlotPhoto(pickerOpen.pageId, pickerOpen.slotIndex, photoId);
    pickerOpen = null;
    await invalidateAll();
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
            <PageControls
              pageId={page.id}
              currentTemplateId={page.template_id}
              kind="album"
              isFirst={idx === 0}
              isLast={idx === data.pages.length - 1}
            />
          </div>
          <div class="relative">
            <PageView
              templateId={page.template_id}
              slots={data.slotsByPage.get(page.id) ?? []}
              onSlotClick={(i) => openPicker(page.id, i)}
              onSwapPhoto={(i) => openPicker(page.id, i)}
              onAdjustCrop={(i) => openEditor(page.id, i)}
              editingSlotIndex={editorOpen?.pageId === page.id ? editorOpen!.slotIndex : null}
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
                    left: {editorLayout.x * 100}%;
                    top: {editorLayout.y * 100}%;
                    width: {editorLayout.w * 100}%;
                    height: {editorLayout.h * 100}%;
                    padding: 2px;
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
