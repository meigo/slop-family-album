<script lang="ts">
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { listCandidatesForPicker, getPhotoTakenAt, type PickerScope } from '$lib/db';
  import { onMount } from 'svelte';
  import { X } from '@lucide/svelte';

  interface Props {
    projectId: number;
    kind: 'album' | 'calendar';
    bucketKey?: string;
    sourceYear?: number;
    currentPhotoId: number | null;
    onPick: (photoId: number) => void;
    onClose: () => void;
  }
  let { projectId, kind, bucketKey, sourceYear, currentPhotoId, onPick, onClose }: Props = $props();

  type Candidate = {
    id: number;
    path: string;
    thumb_path: string | null;
    taken_at: number | null;
    score: number | null;
    embedding: string | null;
  };
  let candidates = $state<Candidate[]>([]);
  let loading = $state(true);
  let sortMode = $state<'score' | 'time' | 'similarity'>('score');
  let scope = $state<PickerScope>('bucket');
  let effectiveBucket = $state<string>('');
  let currentEmbedding = $state<Float32Array | null>(null);

  function decodeB64(b64: string | null): Float32Array | null {
    if (!b64) return null;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  }

  function cosine(a: Float32Array, b: Float32Array): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
    let d = 0;
    for (let i = 0; i < a.length; i++) d += a[i] * b[i];
    return d;
  }

  async function loadCandidates() {
    loading = true;
    candidates = await listCandidatesForPicker({
      projectId, bucketKey: effectiveBucket, kind, scope, sourceYear,
    });
    if (currentPhotoId !== null) {
      const cur = candidates.find((c) => c.id === currentPhotoId);
      if (cur) currentEmbedding = decodeB64(cur.embedding);
    }
    loading = false;
  }

  onMount(async () => {
    let bk = bucketKey ?? '';
    // For album with no bucket key passed: derive from current photo's date.
    if (kind === 'album' && (!bk || bk.length === 0) && currentPhotoId !== null) {
      const taken = await getPhotoTakenAt(currentPhotoId);
      if (taken !== null) {
        const d = new Date(taken);
        const y = d.getFullYear().toString().padStart(4, '0');
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        bk = `${y}-${m}-${dd}`;
      }
    }
    effectiveBucket = bk;
    await loadCandidates();
  });

  // Reload when scope changes.
  $effect(() => {
    if (effectiveBucket) {
      void loadCandidates();
    }
    scope;
  });

  let sorted = $derived.by(() => {
    if (sortMode === 'time') {
      return [...candidates].sort((a, b) => (a.taken_at ?? 0) - (b.taken_at ?? 0) || a.id - b.id);
    }
    if (sortMode === 'similarity' && currentEmbedding !== null) {
      const ce = currentEmbedding;
      return [...candidates].sort((a, b) => {
        const va = decodeB64(a.embedding);
        const vb = decodeB64(b.embedding);
        const sa = va ? cosine(va, ce) : -2;
        const sb = vb ? cosine(vb, ce) : -2;
        return sb - sa;
      });
    }
    return [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id - b.id);
  });

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center"
  style="background: rgba(0, 0, 0, 0.7);"
  role="dialog"
  aria-modal="true"
  aria-label="Pick a photo"
  tabindex="-1"
  onclick={handleBackdrop}
>
  <div class="surface-card relative" style="width: 90vw; max-width: 900px; max-height: 90vh; overflow-y: auto;">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-lg font-medium">Pick a photo</h3>
      <button type="button" class="btn-ghost flex items-center gap-1" onclick={onClose} title="Close (Esc)" aria-label="Close picker">
        <X size={16} /> Esc
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2 mb-3 text-sm">
      <span style="color: var(--color-muted)">Scope:</span>
      <button
        type="button"
        class={scope === 'bucket' ? 'btn-primary' : 'btn-secondary'}
        onclick={() => scope = 'bucket'}
        title={kind === 'album' ? 'Photos from the same day' : 'Photos from the same month of the source year'}
      >{kind === 'album' ? 'Same day' : 'Same month'}</button>
      <button
        type="button"
        class={scope === 'nearby' ? 'btn-primary' : 'btn-secondary'}
        onclick={() => scope = 'nearby'}
        title={kind === 'album' ? 'Photos from the same month' : 'Photos from the source year'}
      >{kind === 'album' ? 'Same month' : 'Source year'}</button>
      <button
        type="button"
        class={scope === 'all' ? 'btn-primary' : 'btn-secondary'}
        onclick={() => scope = 'all'}
        title="All photos in the project"
      >All photos</button>

      <span class="ml-4" style="color: var(--color-muted)">Sort:</span>
      <button
        type="button"
        class={sortMode === 'score' ? 'btn-primary' : 'btn-secondary'}
        onclick={() => sortMode = 'score'}
      >Score</button>
      <button
        type="button"
        class={sortMode === 'time' ? 'btn-primary' : 'btn-secondary'}
        onclick={() => sortMode = 'time'}
      >Chronological</button>
      <button
        type="button"
        class={sortMode === 'similarity' ? 'btn-primary' : 'btn-secondary'}
        onclick={() => sortMode = 'similarity'}
        disabled={currentEmbedding === null}
        title={currentEmbedding === null ? 'No embedding for the current slot photo' : 'Sort by visual similarity to current slot photo'}
      >Similarity</button>
    </div>

    {#if loading}
      <p style="color: var(--color-muted)">Loading candidates…</p>
    {:else if sorted.length === 0}
      <p style="color: var(--color-muted)">No photos available for this scope.</p>
    {:else}
      <p class="text-sm mb-2" style="color: var(--color-muted)">{sorted.length} candidate{sorted.length === 1 ? '' : 's'}</p>
      <div class="grid grid-cols-4 gap-2">
        {#each sorted as c}
          <button
            type="button"
            class="surface-card p-1 relative"
            style={c.id === currentPhotoId ? 'outline: 2px solid var(--color-fg);' : ''}
            onclick={() => onPick(c.id)}
            title={c.path}
          >
            {#if c.thumb_path}
              <img src={convertFileSrc(c.thumb_path)} alt="" class="w-full aspect-square object-cover rounded" draggable="false" />
            {:else}
              <div class="w-full aspect-square" style="background: var(--color-line)"></div>
            {/if}
            {#if c.id === currentPhotoId}
              <span class="absolute top-1 left-1 text-xs px-1 rounded" style="background: var(--color-fg); color: var(--color-bg)">current</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
