<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import EventsPanel from '$lib/components/EventsPanel.svelte';
  import { indexProject } from '$lib/indexing/scanner';
  import { indexProgress, type IndexProgress } from '$lib/indexing/progress';
  import { invalidateAll, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { generateAlbumSelection } from '$lib/selection/album';
  import { generateCalendarSelection } from '$lib/selection/calendar';
  import { assembleAlbumPages, assembleCalendarPages } from '$lib/layout/assembly';
  import {
    seedHolidays,
    updateProjectAlbumMaxPages,
    updateProjectSlotGap,
    updateProjectPagePadding,
    updateProjectSlotCornerRadius,
    updateProjectPageBgColor,
    updateProjectCalendarFontFamily,
  } from '$lib/db';
  import { ALBUM_DEFAULTS } from '$lib/selection/constants';
  import { STYLE_PRESETS } from '$lib/print/style-presets';
  import { loadGoogleFont } from '$lib/text/fonts';

  let { data } = $props();

  function formatRelativeTime(epochMs: number | null): string {
    if (epochMs === null) return 'never';
    const now = Date.now();
    const diff = now - epochMs;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    // Older than a week: show actual date
    return new Date(epochMs).toLocaleDateString();
  }

  // Mirror the module-level progress store into a local $state so the
  // template re-renders on each update. The store survives navigation, so
  // returning to this page mid-index resumes the live counter.
  let pStateLocal = $state<IndexProgress>({
    phase: 'idle', scanned: 0, total: 0, current: '', errors: [], projectId: null,
  });
  onMount(() => indexProgress.subscribe((v) => (pStateLocal = v)));

  // Only treat progress as ours if it's for this project (or hasn't started).
  let mine = $derived(pStateLocal.projectId === null || pStateLocal.projectId === data.project.id);

  async function runIndex() {
    await indexProject(data.project.id);
    await invalidateAll();
  }

  async function runReCv() {
    await indexProject(data.project.id, { forceCv: true });
    await invalidateAll();
  }

  let generating = $state<null | 'album' | 'calendar'>(null);
  // The input is an edit buffer; we don't want server invalidations clobbering
  // an in-progress edit, so the initial value is captured once at mount.
  // Svelte's `state_referenced_locally` warning flags this pattern but it's
  // intentional here.
  let maxPagesInput = $state<number>(data.project.album_max_pages ?? ALBUM_DEFAULTS.default_max_pages);

  async function saveMaxPages() {
    const clamped = Math.max(4, Math.min(80, Math.round(maxPagesInput)));
    maxPagesInput = clamped;
    await updateProjectAlbumMaxPages(data.project.id, clamped);
    await invalidateAll();
  }

  let applyingPreset = $state(false);

  async function applyStylePreset(e: Event) {
    const presetId = (e.currentTarget as HTMLSelectElement).value;
    if (!presetId) return;
    const preset = STYLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    applyingPreset = true;
    try {
      if (preset.calendar_font_family) loadGoogleFont(preset.calendar_font_family);
      await Promise.all([
        updateProjectSlotGap(data.project.id, preset.slot_gap_px),
        updateProjectPagePadding(data.project.id, preset.page_padding_px),
        updateProjectSlotCornerRadius(data.project.id, preset.slot_corner_radius_px),
        updateProjectPageBgColor(data.project.id, preset.page_bg_color),
        updateProjectCalendarFontFamily(data.project.id, preset.calendar_font_family),
      ]);
      await invalidateAll();
    } finally {
      applyingPreset = false;
      // Reset the dropdown so re-selecting the same preset works.
      (e.currentTarget as HTMLSelectElement).value = '';
    }
  }

  async function runGenerateAlbum() {
    if (data.albumSelection && !confirm('Regenerate the album from scratch? Your manual page edits will be lost.')) return;
    generating = 'album';
    try {
      await generateAlbumSelection(data.project.id);
      await assembleAlbumPages(data.project.id);
      await goto(`/projects/${data.project.id}/album/review`);
    } finally {
      generating = null;
    }
  }

  async function runGenerateCalendar() {
    if (data.calendarSelection && !confirm('Regenerate the calendar from scratch? Your manual page edits will be lost.')) return;
    generating = 'calendar';
    try {
      await generateCalendarSelection(data.project.id);
      await assembleCalendarPages(data.project.id);
      await goto(`/projects/${data.project.id}/calendar/review`);
    } finally {
      generating = null;
    }
  }

  async function seed(kind: 'estonian' | 'us') {
    await seedHolidays(data.project.id, kind);
    await invalidateAll();
  }
</script>

<div class="container-page">
  <PageHeader backHref="/">
    <h1 class="text-xl font-medium">{data.project.name}</h1>
  </PageHeader>

  <section class="surface-card mt-4">
    <p class="text-sm" style="color: var(--color-muted)">Source: {data.project.source_dir}</p>
    <p class="text-sm mt-1" style="color: var(--color-muted)">
      Year: {data.project.album_year} → calendar {data.project.calendar_year}
    </p>
    <label class="flex items-center gap-2 mt-2 text-sm" style="color: var(--color-muted)">
      Album max pages:
      <input
        type="number"
        min="4"
        max="80"
        step="1"
        bind:value={maxPagesInput}
        onchange={saveMaxPages}
        class="w-20 px-2 py-1 border rounded"
        title="Cap on auto-generated pages. The assembler packs photos to roughly total/max-pages slots per page."
      />
    </label>
    <label class="flex items-center gap-2 mt-2 text-sm" style="color: var(--color-muted)">
      Apply style preset:
      <select
        onchange={applyStylePreset}
        disabled={applyingPreset}
        style="background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 4px; padding: 2px 6px; font-size: 0.85rem;"
        title="Overwrites slot gap, page padding, slot corner radius, page background color, and calendar font on this project."
      >
        <option value="">— pick a preset —</option>
        {#each STYLE_PRESETS as preset}
          <option value={preset.id} title={preset.description}>{preset.label}</option>
        {/each}
      </select>
    </label>
    <p class="mt-3">
      Indexed: <strong>{data.count}</strong> photos
      {#if data.lastIndexedAt !== null}
        <span style="color: var(--color-muted)" class="text-sm"> · last index {formatRelativeTime(data.lastIndexedAt)}</span>
      {/if}
    </p>
    <div class="flex gap-2 mt-3">
      <button type="button" class="btn-primary" onclick={runIndex} disabled={mine && (pStateLocal.phase === 'walking' || pStateLocal.phase === 'indexing')}>
        {(!mine || pStateLocal.phase === 'idle' || pStateLocal.phase === 'done') ? 'Index now' : 'Indexing…'}
      </button>
      <button
        type="button"
        class="btn-secondary"
        onclick={runReCv}
        disabled={mine && (pStateLocal.phase === 'walking' || pStateLocal.phase === 'indexing')}
        title="Force-recompute CV scores for all photos (use after the blur/faces algorithm changes)"
      >
        Re-run CV
      </button>
      <a class="btn-secondary" href={`/projects/${data.project.id}/library`}>Open library</a>
    </div>
    {#if data.albumSelection}
      <p class="mt-3 text-sm" style="color: var(--color-muted)">
        Album: {data.albumPageCount} {data.albumPageCount === 1 ? 'page' : 'pages'} · last edited {formatRelativeTime(data.albumSelection.updated_at ?? data.albumSelection.generated_at)}
      </p>
    {/if}
    {#if data.calendarSelection}
      <p class="text-sm" style="color: var(--color-muted)">
        Calendar: {data.calendarPageCount} {data.calendarPageCount === 1 ? 'page' : 'pages'} · last edited {formatRelativeTime(data.calendarSelection.updated_at ?? data.calendarSelection.generated_at)}
      </p>
    {/if}
    <div class="flex flex-wrap gap-2 mt-3">
      {#if data.albumSelection}
        <a class="btn-primary" href={`/projects/${data.project.id}/album/review`}>Open album</a>
        <a class="btn-secondary" href={`/projects/${data.project.id}/album/export`} title="Save the album as a PDF">Export album PDF</a>
        <button type="button" class="btn-secondary" onclick={runGenerateAlbum} disabled={generating !== null} title="Discard edits and rebuild from current scoring">
          {generating === 'album' ? 'Regenerating album…' : 'Regenerate album'}
        </button>
      {:else}
        <button type="button" class="btn-primary" onclick={runGenerateAlbum} disabled={generating !== null}>
          {generating === 'album' ? 'Generating album…' : 'Generate album'}
        </button>
      {/if}
      {#if data.calendarSelection}
        <a class="btn-primary" href={`/projects/${data.project.id}/calendar/review`}>Open calendar</a>
        <a class="btn-secondary" href={`/projects/${data.project.id}/calendar/export`} title="Save the calendar as a PDF">Export calendar PDF</a>
        <button type="button" class="btn-secondary" onclick={runGenerateCalendar} disabled={generating !== null} title="Discard edits and rebuild from current scoring">
          {generating === 'calendar' ? 'Regenerating calendar…' : 'Regenerate calendar'}
        </button>
      {:else}
        <button type="button" class="btn-primary" onclick={runGenerateCalendar} disabled={generating !== null}>
          {generating === 'calendar' ? 'Generating calendar…' : 'Generate calendar'}
        </button>
      {/if}
    </div>
    {#if mine && pStateLocal.phase === 'walking'}
      <p class="mt-3 text-sm" style="color: var(--color-muted)">Walking folder…</p>
    {:else if mine && pStateLocal.phase === 'indexing'}
      <p class="mt-3 text-sm" style="color: var(--color-muted)">
        {pStateLocal.scanned} / {pStateLocal.total} — {pStateLocal.current}
      </p>
    {:else if mine && pStateLocal.phase === 'done'}
      <p class="mt-3 text-sm" style="color: var(--color-success)">Done.</p>
    {/if}
    {#if mine && pStateLocal.errors.length > 0}
      <details class="mt-3">
        <summary class="text-sm" style="color: var(--color-danger)">{pStateLocal.errors.length} errors</summary>
        <ul class="text-xs mt-1">
          {#each pStateLocal.errors.slice(0, 20) as e}<li>{e}</li>{/each}
        </ul>
      </details>
    {/if}
  </section>

  <section class="surface-card mt-4">
    <h2 class="text-lg font-medium mb-2">Holiday presets</h2>
    <p class="text-sm mb-2" style="color: var(--color-muted)">Add commonly-used holidays as yearly events.</p>
    <div class="flex gap-2">
      <button type="button" class="btn-secondary" onclick={() => seed('estonian')}>Add Estonian holidays</button>
      <button type="button" class="btn-secondary" onclick={() => seed('us')}>Add US holidays</button>
    </div>
  </section>

  <EventsPanel projectId={data.project.id} />
</div>
