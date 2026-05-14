<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { indexProject } from '$lib/indexing/scanner';
  import { createProgressStore } from '$lib/indexing/progress';
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();
  const progress = createProgressStore();
  let pStateLocal = $state({ phase: 'idle', scanned: 0, total: 0, current: '', errors: [] as string[] });
  progress.subscribe((v) => (pStateLocal = v));

  async function runIndex() {
    await indexProject(data.project.id, progress);
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
      <button type="button" class="btn-primary" onclick={runIndex} disabled={pStateLocal.phase === 'walking' || pStateLocal.phase === 'indexing'}>
        {pStateLocal.phase === 'idle' || pStateLocal.phase === 'done' ? 'Index now' : 'Indexing…'}
      </button>
      <a class="btn-secondary" href={`/projects/${data.project.id}/library`}>Open library</a>
    </div>
    {#if pStateLocal.phase === 'walking'}
      <p class="mt-3 text-sm" style="color: var(--color-muted)">Walking folder…</p>
    {:else if pStateLocal.phase === 'indexing'}
      <p class="mt-3 text-sm" style="color: var(--color-muted)">
        {pStateLocal.scanned} / {pStateLocal.total} — {pStateLocal.current}
      </p>
    {:else if pStateLocal.phase === 'done'}
      <p class="mt-3 text-sm" style="color: var(--color-success)">Done.</p>
    {/if}
    {#if pStateLocal.errors.length > 0}
      <details class="mt-3">
        <summary class="text-sm" style="color: var(--color-danger)">{pStateLocal.errors.length} errors</summary>
        <ul class="text-xs mt-1">
          {#each pStateLocal.errors.slice(0, 20) as e}<li>{e}</li>{/each}
        </ul>
      </details>
    {/if}
  </section>
</div>
