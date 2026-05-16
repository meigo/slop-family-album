<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import PhotoPicker from '$lib/components/PhotoPicker.svelte';
  import { invalidateAll } from '$app/navigation';
  import { updateSlotPhoto } from '$lib/db';

  let { data } = $props();

  let pickerOpen = $state<null | { pageId: number; slotIndex: number; bucketKey: string; currentPhotoId: number | null }>(null);

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
      {data.pages.length} pages · click any photo to swap
    </p>

    <div class="grid grid-cols-2 gap-4 mt-4">
      {#each data.pages as page}
        <section>
          <h2 class="text-sm font-medium mb-1" style="color: var(--color-muted)">
            {monthLabel(page.title)}
          </h2>
          <PageView
            templateId={page.template_id}
            slots={data.slotsByPage.get(page.id) ?? []}
            onSlotClick={(slotIndex) => openPicker(page.id, slotIndex, page.title ?? '')}
          />
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
