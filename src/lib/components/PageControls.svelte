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
  let pickerRoot: HTMLElement | undefined = $state();

  // Close on outside click or Escape. The trigger button is inside
  // pickerRoot so its own click doesn't close (good — it's the toggle).
  function onDocClick(e: MouseEvent) {
    if (!pickerOpen) return;
    if (pickerRoot && !pickerRoot.contains(e.target as Node)) {
      pickerOpen = false;
    }
  }
  function onDocKey(e: KeyboardEvent) {
    if (pickerOpen && e.key === 'Escape') pickerOpen = false;
  }

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

<svelte:window onclick={onDocClick} onkeydown={onDocKey} />

<div class="flex flex-wrap items-center gap-2 text-sm">
  <div class="relative" bind:this={pickerRoot}>
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
      <TemplateIcon templateId={currentTemplateId} width={20} />
    </button>
    {#if pickerOpen}
      {@const cols = Math.ceil(Math.sqrt(templates.length))}
      <div
        class="template-picker-popover"
        role="dialog"
        aria-label="Choose page layout"
        style="grid-template-columns: repeat({cols}, 50px);"
      >
        {#each templates as t}
          <button
            type="button"
            class="template-picker-option"
            class:is-current={t.id === currentTemplateId}
            onclick={() => pickTemplate(t)}
            title={t.label}
          >
            <TemplateIcon templateId={t.id} width={40} />
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
      class="btn-icon"
      onclick={moveUp}
      disabled={busy || isFirst}
      title="Move page up"
      aria-label="Move page up"
    >
      <ArrowUp size={18} />
    </button>
    <button
      type="button"
      class="btn-icon"
      onclick={moveDown}
      disabled={busy || isLast}
      title="Move page down"
      aria-label="Move page down"
    >
      <ArrowDown size={18} />
    </button>
  {/if}
  {#if kind === 'album'}
    <!-- Deleting a calendar page would leave a gap in Jan–Dec; not
         meaningful. Album pages remain freely deletable. -->
    <button
      type="button"
      class="btn-icon"
      onclick={remove}
      disabled={busy}
      title="Delete this page"
      aria-label="Delete page"
      style="color: var(--color-danger);"
    >
      <Trash2 size={18} />
    </button>
  {/if}
</div>
