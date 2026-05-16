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
        template_id: 'cal-month',
      });
      await invalidateAll();
    } finally {
      inserting = false;
    }
  }

  let pickerOpen = $state<null | { pageId: number; slotIndex: number; bucketKey: string; currentPhotoId: number | null }>(null);
  let editorOpen = $state<null | {
    pageId: number;
    slotIndex: number;
    photoPath: string;
    photoWidth: number;
    photoHeight: number;
    initialTransformJson: string | null;
    slotLayoutW: number;
    slotLayoutH: number;
    slotLayoutX: number;
    slotLayoutY: number;
    faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
    topTag: string | null;
  }>(null);

  function monthLabel(bucketKey: string | null): string {
    if (!bucketKey) return '';
    const d = new Date(bucketKey + '-15T12:00:00');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }

  function openPicker(pageId: number, slotIndex: number, bucketKey: string) {
    const slots = data.slotsByPage.get(pageId) ?? [];
    const slot = slots.find((s) => s.slot_index === slotIndex);
    pickerOpen = {
      pageId, slotIndex, bucketKey,
      currentPhotoId: slot?.photo_id ?? null,
    };
  }

  function openEditor(pageId: number, slotIndex: number) {
    const page = data.pages.find((p) => p.id === pageId);
    if (!page) return;
    const slots = data.slotsByPage.get(pageId) ?? [];
    const slot = slots.find((s) => s.slot_index === slotIndex);
    if (!slot || !slot.path || slot.photo_width === null || slot.photo_height === null) return;
    const tpl = getTemplate(page.template_id);
    const slotLayout = tpl.slots[slotIndex];
    if (!slotLayout) return;
    // close picker if it was open
    pickerOpen = null;
    editorOpen = {
      pageId, slotIndex,
      photoPath: slot.path,
      photoWidth: slot.photo_width,
      photoHeight: slot.photo_height,
      initialTransformJson: slot.transform_json,
      slotLayoutX: slotLayout.x,
      slotLayoutY: slotLayout.y,
      slotLayoutW: slotLayout.w,
      slotLayoutH: slotLayout.h,
      faces: slot.faces,
      topTag: slot.top_tag,
    };
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
    <p class="text-sm mt-1">
      <a class="btn-ghost" href={`/projects/${data.project.id}/calendar/sorter`}>open sorter view →</a>
    </p>

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
          <PageView
            templateId={page.template_id}
            slots={data.slotsByPage.get(page.id) ?? []}
            onSlotClick={(slotIndex) => openPicker(page.id, slotIndex, page.title ?? '')}
          />
          <div class="mt-1">
            <PageControls
              pageId={page.id}
              currentTemplateId={page.template_id}
              kind="calendar"
              isFirst={idx === 0}
              isLast={idx === data.pages.length - 1}
            />
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
      onEdit={() => pickerOpen && openEditor(pickerOpen.pageId, pickerOpen.slotIndex)}
    />
  {/if}

  {#if editorOpen}
    <SlotEditor
      pageId={editorOpen.pageId}
      slotIndex={editorOpen.slotIndex}
      photoPath={editorOpen.photoPath}
      photoWidth={editorOpen.photoWidth}
      photoHeight={editorOpen.photoHeight}
      initialTransformJson={editorOpen.initialTransformJson}
      slotLayout={{ x: editorOpen.slotLayoutX, y: editorOpen.slotLayoutY, w: editorOpen.slotLayoutW, h: editorOpen.slotLayoutH }}
      pageAspect="landscape"
      faces={editorOpen.faces}
      topTag={editorOpen.topTag}
      onClose={() => editorOpen = null}
    />
  {/if}
</div>
