<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
  import { invalidateAll } from '$app/navigation';
  import { updateSlotPhoto } from '$lib/db';

  let { data } = $props();

  let pickerOpen = $state<null | { pageId: number; slotIndex: number; currentPhotoId: number | null }>(null);

  function openPicker(pageId: number, slotIndex: number) {
    const slots = data.slotsByPage.get(pageId) ?? [];
    const slot = slots.find((s) => s.slot_index === slotIndex);
    pickerOpen = {
      pageId,
      slotIndex,
      currentPhotoId: slot?.photo_id ?? null,
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
      {data.pages.length} pages · click any photo to swap
    </p>

    <div class="flex flex-col gap-6 mt-4">
      {#each data.pages as page, idx}
        <section>
          <h2 class="text-sm font-medium mb-1" style="color: var(--color-muted)">
            Page {idx + 1}{page.title ? ` · ${page.title}` : ''} · template {page.template_id}
          </h2>
          <PageView
            templateId={page.template_id}
            slots={data.slotsByPage.get(page.id) ?? []}
            onSlotClick={(slotIndex) => openPicker(page.id, slotIndex)}
          />
        </section>
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
