<script lang="ts">
  import PageHeader from "$lib/components/PageHeader.svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { createProject, listProjectsWithThumbs, deleteProject, type ProjectWithThumb } from "$lib/db";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { LayoutDashboard, Trash2, Plus } from "@lucide/svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";

  let projects = $state<ProjectWithThumb[]>([]);
  let name = $state("");
  let albumYear = $state(new Date().getFullYear() - 1);
  let sourceDir = $state("");
  let newProjectOpen = $state(false);

  onMount(async () => {
    projects = await listProjectsWithThumbs();
  });

  function openNewProject() {
    name = "";
    sourceDir = "";
    albumYear = new Date().getFullYear() - 1;
    newProjectOpen = true;
  }

  function closeNewProject() {
    newProjectOpen = false;
  }

  async function pickDir() {
    const result = await open({ directory: true, multiple: false });
    if (typeof result === "string") sourceDir = result;
  }

  async function create() {
    if (!name || !sourceDir) return;
    const id = await createProject({ name, source_dir: sourceDir, album_year: albumYear });
    newProjectOpen = false;
    await goto(`/projects/${id}`);
  }

  let pendingDelete = $state<ProjectWithThumb | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    pendingDelete = null;
    await deleteProject(id);
    projects = await listProjectsWithThumbs();
  }

  function onModalKey(e: KeyboardEvent) {
    if (newProjectOpen && e.key === "Escape") closeNewProject();
  }
</script>

<svelte:window onkeydown={onModalKey} />

<div class="container-page">
  <PageHeader>
    <h1 class="text-xl font-medium flex items-center gap-2">
      <LayoutDashboard size={22} aria-hidden="true" />
      Annual Photo Album & Calendar
    </h1>
  </PageHeader>

  <p class="mt-2" style="color: var(--color-muted); line-height: 1.5;">
    Build a printable photo book and matching wall calendar from a year of your photos. The app indexes a source folder, scores photos with
    on-device computer vision, auto-assembles pages you can review and tweak, and exports both as PDFs ready for a print shop.
  </p>

  <section class="mt-6">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-medium">Projects</h2>
      <button type="button" class="btn-primary flex items-center gap-1" onclick={openNewProject}>
        <Plus size={16} /> New project
      </button>
    </div>

    {#if projects.length === 0}
      <p class="surface-card" style="color: var(--color-muted)">No projects yet. Click "New project" to create one.</p>
    {:else}
      <ul class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
        {#each projects as p}
          <li class="surface-card relative group" style="padding: 0; overflow: hidden;">
            <a href={`/projects/${p.id}`} class="block">
              {#if p.thumb_path}
                <img
                  src={convertFileSrc(p.thumb_path)}
                  alt=""
                  class="block w-full"
                  style="aspect-ratio: 4 / 3; object-fit: cover; background: var(--color-line);"
                  loading="lazy"
                  draggable="false" />
              {:else}
                <div
                  class="w-full flex items-center justify-center text-xs"
                  style="aspect-ratio: 4 / 3; background: var(--color-line); color: var(--color-muted);">
                  Not indexed yet
                </div>
              {/if}
              <div class="flex flex-col gap-1" style="padding: var(--space-3);">
                <span class="font-medium pr-6">{p.name}</span>
                <span style="color: var(--color-muted)" class="text-sm">{p.album_year}</span>
              </div>
            </a>
            <button
              type="button"
              class="btn-icon absolute top-1 right-1 opacity-0 group-hover:opacity-100"
              style="width: 24px; height: 24px; color: var(--color-danger);"
              onclick={() => (pendingDelete = p)}
              title="Delete project"
              aria-label={`Delete project ${p.name}`}>
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
        onclick={(e) => e.stopPropagation()}>
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
      onCancel={() => (pendingDelete = null)} />
  {/if}
</div>
