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
    next.splice(dropIdx, 0, moved);
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

  function openInReview(pageId: number) {
    // Hash navigation lets the browser scroll the matching #page-N
    // element into view automatically once the album review page is
    // loaded; the review page sets scroll-margin-top so the heading
    // sits below any fixed/sticky chrome.
    goto(`/projects/${data.project.id}/album/review#page-${pageId}`);
  }
</script>

<div class="container-page">
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

    <!-- Responsive grid: columns auto-fill at min 200px, sharing leftover
         width equally. Narrow viewports wrap to fewer columns; the dashed
         drop highlight tracks the actual column width (no longer a fixed
         220px outline drifting from the thumb edge). -->
    <div class="grid gap-3 mt-4" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));">
      {#each localOrder as page, idx (page.id)}
        <div>
          <!-- The thumb is both a drag handle and a click-to-open target.
               HTML5 DnD fires click only when no drag happened. -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="relative"
            style="
              cursor: pointer;
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
            onclick={() => openInReview(page.id)}
            title="Page {idx + 1}{page.title ? ` · ${page.title}` : ''} · click to open · drag to reorder"
          >
            <PageThumb
              templateId={page.template_id}
              slots={data.slotsByPage.get(page.id) ?? []}
            />
          </div>
          <div class="text-xs text-center mt-1" style="color: var(--color-muted);">
            {idx + 1}{page.title ? ` · ${page.title}` : ''}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
