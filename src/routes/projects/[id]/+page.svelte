<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { indexProject } from '$lib/indexing/scanner';
  import { indexProgress, type IndexProgress } from '$lib/indexing/progress';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';

  let { data } = $props();

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
    <p class="mt-3">Indexed: <strong>{data.count}</strong> photos</p>
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
</div>
