<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { createProject, listProjects, deleteProject } from '$lib/db';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { ProjectRow } from '$lib/db/types';
  import { LayoutDashboard, Trash2 } from '@lucide/svelte';

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

  async function removeProject(p: ProjectRow) {
    const msg = `Delete project "${p.name}"?\n\nThis removes the index, CV scores, selections, generated pages, and all events — but does NOT touch the photos on disk in:\n${p.source_dir}`;
    if (!confirm(msg)) return;
    await deleteProject(p.id);
    projects = await listProjects();
  }
</script>

<div class="container-page">
  <PageHeader>
    <h1 class="text-xl font-medium flex items-center gap-2">
      <LayoutDashboard size={22} aria-hidden="true" />
      Family Album & Calendar Builder
    </h1>
  </PageHeader>

  <!-- Two-column on wide viewports: compact 400px form on the left,
       responsive project grid filling the rest on the right. Below
       1024px (Tailwind lg) the layout collapses to a single column
       so the form stays usable on narrow windows. -->
  <div class="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 mt-4 items-start">
    <section class="surface-card">
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

    <section>
      <h2 class="text-lg font-medium mb-3">Open existing</h2>
      {#if projects.length === 0}
        <p class="surface-card" style="color: var(--color-muted)">
          No projects yet. Fill the form on the left to start.
        </p>
      {:else}
        <ul class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
          {#each projects as p}
            <li class="surface-card relative group">
              <a href={`/projects/${p.id}`} class="flex flex-col gap-1">
                <span class="font-medium pr-6">{p.name}</span>
                <span style="color: var(--color-muted)" class="text-sm">{p.album_year}</span>
              </a>
              <button
                type="button"
                class="btn-icon absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                style="width: 24px; height: 24px; color: var(--color-danger);"
                onclick={() => removeProject(p)}
                title="Delete project"
                aria-label={`Delete project ${p.name}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>
