<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { indexProject } from '$lib/indexing/scanner';
  import { indexProgress, type IndexProgress } from '$lib/indexing/progress';
  import { invalidateAll, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { generateAlbumSelection } from '$lib/selection/album';
  import { generateCalendarSelection } from '$lib/selection/calendar';
  import { assembleAlbumPages, assembleCalendarPages } from '$lib/layout/assembly';
  import { updateProjectAlbumMaxPages } from '$lib/db';
  import { ALBUM_DEFAULTS } from '$lib/selection/constants';

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

</script>

<div class="container-page">
  <PageHeader backHref="/">
    <h1 class="text-xl font-medium">{data.project.name}</h1>
  </PageHeader>

  <p class="text-sm mt-1" style="color: var(--color-muted)">
    <span title="Source folder">{data.project.source_dir}</span>
    <span class="mx-2">·</span>
    <span>Album {data.project.album_year} → Calendar {data.project.calendar_year}</span>
  </p>

  <!-- Photo library: index + maintenance actions on the source folder -->
  <section class="surface-card mt-4">
    <h2 class="text-lg font-medium mb-1">Photo library</h2>
    <p class="text-sm mb-3" style="color: var(--color-muted)">
      The app reads photos from the source folder, extracts dates and camera
      info from EXIF, and scores each photo on-device (blur, faces, scenes,
      exposure) so it can pick the best ones for the album and calendar.
    </p>
    <p>
      Indexed: <strong>{data.count}</strong> photos
      {#if data.lastIndexedAt !== null}
        <span style="color: var(--color-muted)" class="text-sm"> · last index {formatRelativeTime(data.lastIndexedAt)}</span>
      {/if}
    </p>
    <div class="flex flex-wrap gap-2 mt-3">
      <button type="button" class="btn-primary" onclick={runIndex} disabled={mine && (pStateLocal.phase === 'walking' || pStateLocal.phase === 'indexing')}>
        {(!mine || pStateLocal.phase === 'idle' || pStateLocal.phase === 'done') ? 'Index now' : 'Indexing…'}
      </button>
      <button
        type="button"
        class="btn-secondary"
        onclick={runReCv}
        disabled={mine && (pStateLocal.phase === 'walking' || pStateLocal.phase === 'indexing')}
        title="Recompute the per-photo quality scores from scratch. Useful after the underlying analysis algorithm changes."
      >
        Re-analyze photos
      </button>
      <a class="btn-secondary" href={`/projects/${data.project.id}/library`}>Open library</a>
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

  <!-- Outputs: album book + wall calendar generated from the indexed photos -->
  <section class="surface-card mt-4">
    <h2 class="text-lg font-medium mb-1">Outputs</h2>
    <p class="text-sm mb-3" style="color: var(--color-muted)">
      Generate a printable photo book and a matching wall calendar from the
      indexed photos. Both can be regenerated, re-styled, and exported to PDF
      any time without re-indexing.
    </p>
    <label class="flex items-center gap-2 text-sm" style="color: var(--color-muted)">
      Album max pages:
      <input
        type="number"
        min="4"
        max="80"
        step="1"
        bind:value={maxPagesInput}
        onchange={saveMaxPages}
        class="w-20 px-2 py-1 border rounded"
        title="Cap on auto-generated album pages. The assembler packs photos to roughly total/max-pages slots per page."
      />
    </label>
    <div class="grid gap-4 lg:grid-cols-2 mt-3">
      <div class="output-group">
        <h3 class="text-sm font-medium mb-2">Album</h3>
        {#if data.albumSelection}
          <p class="text-xs mb-2" style="color: var(--color-muted)">
            {data.albumPageCount} {data.albumPageCount === 1 ? 'page' : 'pages'} · last edited {formatRelativeTime(data.albumSelection.updated_at ?? data.albumSelection.generated_at)}
          </p>
        {:else}
          <p class="text-xs mb-2" style="color: var(--color-muted)">Not yet generated.</p>
        {/if}
        <div class="flex flex-wrap gap-2">
          {#if data.albumSelection}
            <a class="btn-primary" href={`/projects/${data.project.id}/album/review`}>Open</a>
            <a class="btn-secondary" href={`/projects/${data.project.id}/album/export`} title="Save the album as a PDF">Export PDF</a>
            <button type="button" class="btn-secondary" onclick={runGenerateAlbum} disabled={generating !== null} title="Discard edits and rebuild from current scoring">
              {generating === 'album' ? 'Regenerating…' : 'Regenerate'}
            </button>
          {:else}
            <button type="button" class="btn-primary" onclick={runGenerateAlbum} disabled={generating !== null}>
              {generating === 'album' ? 'Generating…' : 'Generate album'}
            </button>
          {/if}
        </div>
      </div>

      <div class="output-group">
        <h3 class="text-sm font-medium mb-2">Calendar</h3>
        {#if data.calendarSelection}
          <p class="text-xs mb-2" style="color: var(--color-muted)">
            {data.calendarPageCount} {data.calendarPageCount === 1 ? 'page' : 'pages'} · last edited {formatRelativeTime(data.calendarSelection.updated_at ?? data.calendarSelection.generated_at)}
          </p>
        {:else}
          <p class="text-xs mb-2" style="color: var(--color-muted)">Not yet generated.</p>
        {/if}
        <div class="flex flex-wrap gap-2">
          {#if data.calendarSelection}
            <a class="btn-primary" href={`/projects/${data.project.id}/calendar/review`}>Open</a>
            <a class="btn-secondary" href={`/projects/${data.project.id}/calendar/export`} title="Save the calendar as a PDF">Export PDF</a>
            <button type="button" class="btn-secondary" onclick={runGenerateCalendar} disabled={generating !== null} title="Discard edits and rebuild from current scoring">
              {generating === 'calendar' ? 'Regenerating…' : 'Regenerate'}
            </button>
          {:else}
            <button type="button" class="btn-primary" onclick={runGenerateCalendar} disabled={generating !== null}>
              {generating === 'calendar' ? 'Generating…' : 'Generate calendar'}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- Holiday presets + EventsPanel are hidden while the calendar grid
       isn't rendering events. The underlying calendar_event table still
       holds any previously-seeded rows, and seedHolidays / EventsPanel
       both still work — wrap them back in a toggle once we re-introduce
       a visual treatment for marked days. -->
  <!--
  <section class="surface-card mt-4">
    <h2 class="text-lg font-medium mb-2">Holiday presets</h2>
    <p class="text-sm mb-2" style="color: var(--color-muted)">Add commonly-used holidays as yearly events.</p>
    <div class="flex gap-2">
      <button type="button" class="btn-secondary" onclick={() => seed('estonian')}>Add Estonian holidays</button>
      <button type="button" class="btn-secondary" onclick={() => seed('us')}>Add US holidays</button>
    </div>
  </section>
  <EventsPanel projectId={data.project.id} />
  -->
</div>
