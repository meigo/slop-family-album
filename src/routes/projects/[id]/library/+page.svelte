<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';

  let { data } = $props();

  function fmtDate(t: number | null): string {
    if (!t) return '—';
    return new Date(t).toLocaleDateString();
  }
</script>

<div class="container-page" style="max-width: 1000px;">
  <PageHeader backHref={`/projects/${data.project.id}`}>
    <h1 class="text-xl font-medium">{data.project.name} — library</h1>
  </PageHeader>

  <p class="text-sm mt-2" style="color: var(--color-muted)">{data.photos.length} photos</p>

  <div class="grid grid-cols-4 gap-2 mt-4">
    {#each data.photos as photo}
      <figure class="surface-card p-1">
        {#if photo.thumb_path}
          <img src={convertFileSrc(photo.thumb_path)} alt="" class="w-full aspect-square object-cover rounded" />
        {:else}
          <div class="w-full aspect-square" style="background: var(--color-line)"></div>
        {/if}
        <figcaption class="text-xs mt-1 truncate" style="color: var(--color-muted)" title={photo.path}>
          {fmtDate(photo.taken_at)}
        </figcaption>
      </figure>
    {/each}
  </div>
</div>
