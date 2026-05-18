<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { createProject, listProjects, deleteProject } from '$lib/db';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { ProjectRow } from '$lib/db/types';
  import { LayoutDashboard, Trash2, Plus } from '@lucide/svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

  let projects = $state<ProjectRow[]>([]);
  let name = $state('');
  let albumYear = $state(new Date().getFullYear() - 1);
  let sourceDir = $state('');
  let newProjectOpen = $state(false);

  onMount(async () => { projects = await listProjects(); });

  function openNewProject() {
    name = '';
    sourceDir = '';
    albumYear = new Date().getFullYear() - 1;
    newProjectOpen = true;
  }

  function closeNewProject() {
    newProjectOpen = false;
  }

  async function pickDir() {
    const result = await open({ directory: true, multiple: false });
    if (typeof result === 'string') sourceDir = result;
  }

  async function create() {
    if (!name || !sourceDir) return;
    const id = await createProject({ name, source_dir: sourceDir, album_year: albumYear });
    newProjectOpen = false;
    await goto(`/projects/${id}`);
  }

  let pendingDelete = $state<ProjectRow | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    pendingDelete = null;
    await deleteProject(id);
    projects = await listProjects();
  }

  function onModalKey(e: KeyboardEvent) {
    if (newProjectOpen && e.key === 'Escape') closeNewProject();
  }
</script>

<svelte:window onkeydown={onModalKey} />

<div class="container-page">
  <PageHeader>
    <h1 class="text-xl font-medium flex items-center gap-2">
      <LayoutDashboard size={22} aria-hidden="true" />
      Family Album & Calendar Builder
    </h1>
  </PageHeader>

  <section class="mt-4">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-medium">Projects</h2>
      <button type="button" class="btn-primary flex items-center gap-1" onclick={openNewProject}>
        <Plus size={16} /> New project
      </button>
    </div>

    {#if projects.length === 0}
      <p class="surface-card" style="color: var(--color-muted)">
        No projects yet. Click "New project" to create one.
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
              onclick={() => (pendingDelete = p)}
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

  {#if newProjectOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events
         a11y_no_static_element_interactions
         — backdrop is a click-to-cancel affordance; Esc closes via the
         window onkeydown above. -->
    <div class="modal-backdrop" role="presentation" onclick={closeNewProject}>
      <div
        class="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
      >
        <h2 id="new-project-title" class="text-lg font-medium mb-3">New project</h2>
        <label class="block mb-2">
          <span class="text-sm" style="color: var(--color-muted)">Name</span>
          <!-- svelte-ignore a11y_autofocus -->
          <input class="input-base mt-1" bind:value={name} placeholder="2025 family album" autofocus />
        </label>
        <label class="block mb-2">
          <span class="text-sm" style="color: var(--color-muted)">Year photographed</span>
          <input class="input-base mt-1" type="number" bind:value={albumYear} />
        </label>
        <label class="block mb-4">
          <span class="text-sm" style="color: var(--color-muted)">Source folder</span>
          <div class="flex gap-2 mt-1">
            <input class="input-base flex-1" readonly value={sourceDir} placeholder="No folder selected" />
            <button type="button" class="btn-secondary" onclick={pickDir}>Choose…</button>
          </div>
        </label>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" onclick={closeNewProject}>Cancel</button>
          <button type="button" class="btn-primary" disabled={!name || !sourceDir} onclick={create}>Create</button>
        </div>
      </div>
    </div>
  {/if}

  {#if pendingDelete}
    <ConfirmDialog
      title={`Delete project "${pendingDelete.name}"?`}
      message={`This removes the index, CV scores, selections, generated pages, and all events.\n\nThe photos on disk in\n${pendingDelete.source_dir}\nare not touched.`}
      confirmLabel="Delete"
      danger
      onConfirm={confirmDelete}
      onCancel={() => (pendingDelete = null)}
    />
  {/if}
</div>
