<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';

  let { data } = $props();

  function bucketLabel(key: string, kind: 'album' | 'calendar'): string {
    if (kind === 'album') {
      if (key === 'no-date') return 'No date';
      const d = new Date(key + 'T12:00:00');
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
    const d = new Date(key + '-15T12:00:00');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }

  let totalPhotos = $derived(
    [...data.photosByBucket.values()].reduce((a, b) => a + b.length, 0)
  );
</script>

<div class="container-page" style="max-width: 1000px;">
  <PageHeader backHref={`/projects/${data.project.id}`}>
    <h1 class="text-xl font-medium">
      {data.project.name} — {data.kind === 'album' ? 'album' : 'calendar'} selection
    </h1>
  </PageHeader>

  {#if !data.selection}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">
        No {data.kind} generated yet. Return to the dashboard and click
        "Generate {data.kind}".
      </p>
    </section>
  {:else}
    <p class="text-sm mt-2" style="color: var(--color-muted)">
      {totalPhotos} photos across {data.photosByBucket.size} bucket{data.photosByBucket.size === 1 ? '' : 's'}
      · generated {new Date(data.selection.generated_at).toLocaleString()}
    </p>

    <div class="flex flex-col gap-6 mt-4">
      {#each [...data.photosByBucket.entries()] as [bucket, photos]}
        <section>
          <h2 class="text-lg font-medium mb-2">{bucketLabel(bucket, data.kind)}</h2>
          <div class="grid grid-cols-4 gap-2">
            {#each photos as photo}
              <figure class="surface-card p-1">
                {#if photo.thumb_path}
                  <img src={convertFileSrc(photo.thumb_path)} alt="" class="w-full aspect-square object-cover rounded" />
                {:else}
                  <div class="w-full aspect-square" style="background: var(--color-line)"></div>
                {/if}
                <figcaption class="text-xs mt-1" style="color: var(--color-muted)">
                  rank {photo.rank} · score {photo.score?.toFixed(2) ?? '—'}
                </figcaption>
              </figure>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>
