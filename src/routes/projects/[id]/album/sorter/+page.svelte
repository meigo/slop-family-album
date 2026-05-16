<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageThumb from '$lib/components/PageThumb.svelte';
  import { setPageOrder } from '$lib/db';
  import { invalidateAll, goto } from '$app/navigation';

  let { data } = $props();

  let localOrder = $state<typeof data.pages>([]);
  $effect(() => { localOrder = [...data.pages]; });

  let draggingId = $state<number | null>(null);
  let overIdx = $state<number | null>(null);

  function onDragStart(e: DragEvent, pageId: number) {
    draggingId = pageId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(pageId));
    }
  }

  // HTML5 DnD requires preventDefault on BOTH dragenter AND dragover for
  // drop to fire. Some browsers (incl. WebView2) enforce this strictly.
  function onDragEnter(e: DragEvent, idx: number) {
    e.preventDefault();
    overIdx = idx;
  }

  function onDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    overIdx = idx;
  }

  async function onDrop(e: DragEvent, dropIdx: number) {
    e.preventDefault();
    e.stopPropagation();
    overIdx = null;
    if (draggingId === null) return;
    const fromIdx = localOrder.findIndex((p) => p.id === draggingId);
    if (fromIdx === -1 || fromIdx === dropIdx) {
      draggingId = null;
      return;
    }
    const next = [...localOrder];
    const [moved] = next.splice(fromIdx, 1);
    const insertAt = fromIdx < dropIdx ? dropIdx - 1 : dropIdx;
    next.splice(insertAt, 0, moved);
    localOrder = next;
    draggingId = null;
    if (!data.selection) return;
    await setPageOrder(data.selection.id, next.map((p) => p.id));
    await invalidateAll();
  }

  function onDragEnd() {
    draggingId = null;
    overIdx = null;
  }

  function openInReview() {
    goto(`/projects/${data.project.id}/album/review`);
  }
</script>

<div class="container-page" style="max-width: 1100px;">
  <PageHeader backHref={`/projects/${data.project.id}`}>
    <h1 class="text-xl font-medium">{data.project.name} — album sorter</h1>
  </PageHeader>

  {#if !data.selection || localOrder.length === 0}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">No album generated yet.</p>
    </section>
  {:else}
    <p class="text-sm mt-2" style="color: var(--color-muted)">
      {localOrder.length} pages · drag to reorder · click a page to open the full review
    </p>
    <p class="text-sm mt-1">
      <a class="btn-ghost" href={`/projects/${data.project.id}/album/review`}>← back to full review</a>
    </p>

    <div class="grid grid-cols-4 gap-3 mt-4">
      {#each localOrder as page, idx (page.id)}
        <div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="relative"
            style="
              cursor: grab;
              opacity: {draggingId === page.id ? 0.4 : 1};
              outline: {overIdx === idx ? '2px dashed var(--color-fg)' : 'none'};
              outline-offset: 4px;
            "
            draggable="true"
            ondragstart={(e) => onDragStart(e, page.id)}
            ondragenter={(e) => onDragEnter(e, idx)}
            ondragover={(e) => onDragOver(e, idx)}
            ondrop={(e) => onDrop(e, idx)}
            ondragend={onDragEnd}
            title="Page {idx + 1}{page.title ? ` · ${page.title}` : ''} · drag to move"
          >
            <PageThumb
              templateId={page.template_id}
              slots={data.slotsByPage.get(page.id) ?? []}
              width={220}
            />
          </div>
          <button
            type="button"
            class="btn-ghost text-xs text-center w-full"
            style="margin-top: 0.25rem; padding: 0.125rem;"
            onclick={openInReview}
            title="Open in full review"
          >
            {idx + 1}{page.title ? ` · ${page.title}` : ''}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
