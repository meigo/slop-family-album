<script lang="ts">
  import { albumTemplates, calendarTemplates, type Template } from '$lib/layout/templates';
  import { reorderPage, updatePageTemplate, deletePage } from '$lib/db';
  import { invalidateAll } from '$app/navigation';
  import { ArrowUp, ArrowDown, Trash2 } from '@lucide/svelte';

  interface Props {
    pageId: number;
    currentTemplateId: string;
    kind: 'album' | 'calendar';
    isFirst: boolean;
    isLast: boolean;
  }
  let { pageId, currentTemplateId, kind, isFirst, isLast }: Props = $props();

  let busy = $state(false);

  let templates = $derived<Template[]>(kind === 'album' ? albumTemplates() : calendarTemplates());

  async function changeTemplate(e: Event) {
    const newId = (e.target as HTMLSelectElement).value;
    if (newId === currentTemplateId) return;
    const t = templates.find((x) => x.id === newId);
    if (!t) return;
    busy = true;
    try {
      await updatePageTemplate(pageId, t.id, t.slot_count);
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  async function moveUp() {
    busy = true;
    try {
      await reorderPage(pageId, 'up');
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  async function moveDown() {
    busy = true;
    try {
      await reorderPage(pageId, 'down');
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!confirm('Delete this page?')) return;
    busy = true;
    try {
      await deletePage(pageId);
      await invalidateAll();
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-wrap items-center gap-2 text-sm">
  <select
    class="input-base"
    style="width: auto; padding: 0.25rem 0.5rem;"
    value={currentTemplateId}
    onchange={changeTemplate}
    disabled={busy}
    aria-label="Page layout"
  >
    {#each templates as t}
      <option value={t.id}>{t.label}</option>
    {/each}
  </select>

  {#if kind === 'album'}
    <!-- Calendar months are fixed Jan–Dec; reordering pages would
         desynchronize page-title and the month it represents. Hidden
         for calendar; only album pages can be reordered. -->
    <button
      type="button"
      class="btn-ghost"
      onclick={moveUp}
      disabled={busy || isFirst}
      title="Move page up"
      aria-label="Move page up"
    >
      <ArrowUp size={16} />
    </button>
    <button
      type="button"
      class="btn-ghost"
      onclick={moveDown}
      disabled={busy || isLast}
      title="Move page down"
      aria-label="Move page down"
    >
      <ArrowDown size={16} />
    </button>
  {/if}
  <button
    type="button"
    class="btn-ghost"
    onclick={remove}
    disabled={busy}
    title="Delete this page"
    aria-label="Delete page"
    style="color: var(--color-danger);"
  >
    <Trash2 size={16} />
  </button>
</div>
