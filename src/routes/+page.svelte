<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { createProject, listProjects } from '$lib/db';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { ProjectRow } from '$lib/db/types';

  let projects = $state<ProjectRow[]>([]);
  let name = $state('');
  let albumYear = $state(new Date().getFullYear() - 1);
  let sourceDir = $state('');

  onMount(async () => { projects = await listProjects(); });

  async function pickDir() {
    const result = await open({ directory: true, multiple: false });
    if (typeof result === 'string') sourceDir = result;
  }

  async function create() {
    if (!name || !sourceDir) return;
    const id = await createProject({ name, source_dir: sourceDir, album_year: albumYear });
    await goto(`/projects/${id}`);
  }
</script>

<div class="container-page">
  <PageHeader>
    <h1 class="text-xl font-medium">Family Album & Calendar Builder</h1>
  </PageHeader>

  <section class="surface-card mt-4">
    <h2 class="text-lg font-medium mb-3">New project</h2>
    <label class="block mb-2">
      <span class="text-sm" style="color: var(--color-muted)">Name</span>
      <input class="input-base mt-1" bind:value={name} placeholder="2025 family album" />
    </label>
    <label class="block mb-2">
      <span class="text-sm" style="color: var(--color-muted)">Year photographed</span>
      <input class="input-base mt-1" type="number" bind:value={albumYear} />
    </label>
    <label class="block mb-3">
      <span class="text-sm" style="color: var(--color-muted)">Source folder</span>
      <div class="flex gap-2 mt-1">
        <input class="input-base flex-1" readonly value={sourceDir} placeholder="No folder selected" />
        <button type="button" class="btn-secondary" onclick={pickDir}>Choose…</button>
      </div>
    </label>
    <button type="button" class="btn-primary w-full" disabled={!name || !sourceDir} onclick={create}>Create</button>
  </section>

  {#if projects.length > 0}
    <section class="mt-6">
      <h2 class="text-lg font-medium mb-3">Open existing</h2>
      <ul class="flex flex-col gap-2">
        {#each projects as p}
          <li class="surface-card">
            <a href={`/projects/${p.id}`} class="flex items-baseline justify-between gap-3">
              <span>{p.name}</span>
              <span style="color: var(--color-muted)" class="text-sm">{p.album_year}</span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
