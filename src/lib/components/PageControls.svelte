<script lang="ts">
  import { albumTemplates, calendarTemplates, type Template } from '$lib/layout/templates';
  import { reorderPage, updatePageTemplate, deletePage } from '$lib/db';
  import { invalidateAll } from '$app/navigation';
  import { ArrowUp, ArrowDown, Trash2 } from '@lucide/svelte';
  import TemplateIcon from './TemplateIcon.svelte';

  interface Props {
    pageId: number;
    currentTemplateId: string;
    kind: 'album' | 'calendar';
    isFirst: boolean;
    isLast: boolean;
  }
  let { pageId, currentTemplateId, kind, isFirst, isLast }: Props = $props();

  let busy = $state(false);
  let pickerOpen = $state(false);

  let templates = $derived<Template[]>(kind === 'album' ? albumTemplates() : calendarTemplates());

  async function pickTemplate(t: Template) {
    pickerOpen = false;
    if (t.id === currentTemplateId) return;
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
  <div class="relative">
    <button
      type="button"
      class="template-picker-btn"
      onclick={() => (pickerOpen = !pickerOpen)}
      disabled={busy}
      title={templates.find((t) => t.id === currentTemplateId)?.label ?? currentTemplateId}
      aria-label="Page layout"
      aria-haspopup="true"
      aria-expanded={pickerOpen}
    >
      <TemplateIcon templateId={currentTemplateId} width={kind === 'album' ? 22 : 30} />
    </button>
    {#if pickerOpen}
      {@const cols = Math.ceil(Math.sqrt(templates.length))}
      <div
        class="template-picker-popover"
        role="dialog"
        aria-label="Choose page layout"
        style="grid-template-columns: repeat({cols}, {kind === 'album' ? 44 : 60}px);"
      >
        {#each templates as t}
          <button
            type="button"
            class="template-picker-option"
            class:is-current={t.id === currentTemplateId}
            onclick={() => pickTemplate(t)}
            title={t.label}
          >
            <TemplateIcon templateId={t.id} width={kind === 'album' ? 40 : 56} />
          </button>
        {/each}
      </div>
    {/if}
  </div>

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
  {#if kind === 'album'}
    <!-- Deleting a calendar page would leave a gap in Jan–Dec; not
         meaningful. Album pages remain freely deletable. -->
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
  {/if}
</div>
