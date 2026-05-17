<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import { PAPER_SIZES_SQUARE, findSize } from '$lib/print/sizes';
  import { printWhenReady, setPrintPageSize } from '$lib/print/prepare';
  import { Printer } from '@lucide/svelte';

  let { data } = $props();

  let sizeId = $state(PAPER_SIZES_SQUARE[0].id);
  let printing = $state(false);
  let chosenSize = $derived(findSize(PAPER_SIZES_SQUARE, sizeId));

  async function exportPdf() {
    printing = true;
    try {
      setPrintPageSize(chosenSize.cssSize);
      await printWhenReady();
    } finally {
      printing = false;
    }
  }
</script>

<svelte:head>
  <title>{data.project.name} — album</title>
</svelte:head>

<div class="container-page print-hide" style="max-width: 1000px;">
  <PageHeader backHref={`/projects/${data.project.id}/album/review`}>
    <h1 class="text-xl font-medium">{data.project.name} — export album</h1>
  </PageHeader>

  {#if !data.selection || data.pages.length === 0}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">No album generated yet.</p>
    </section>
  {:else}
    <section class="surface-card mt-4 flex flex-wrap items-center gap-3">
      <label class="text-sm flex items-center gap-2">
        Paper size:
        <select bind:value={sizeId} class="input-base" style="padding: 0.25rem 0.5rem; width: auto;">
          {#each PAPER_SIZES_SQUARE as s}
            <option value={s.id}>{s.label}</option>
          {/each}
        </select>
      </label>
      <button type="button" class="btn-primary flex items-center gap-2" style="width: auto;" onclick={exportPdf} disabled={printing}>
        <Printer size={16} />
        {printing ? 'Preparing…' : 'Save as PDF'}
      </button>
      <p class="text-sm" style="color: var(--color-muted); flex: 1; min-width: 100%;">
        Click "Save as PDF" → choose "Save as PDF" as the destination in the print dialog.
      </p>
    </section>
  {/if}
</div>

<div class="print-pages" style="--page-aspect: {chosenSize.aspect};">
  {#each data.pages as page (page.id)}
    <div class="print-page">
      <PageView
        templateId={page.template_id}
        slots={data.slotsByPage.get(page.id) ?? []}
        slotGapPx={data.project.slot_gap_px}
        pagePaddingPx={data.project.page_padding_px}
        pageBgColor={data.project.page_bg_color}
        texts={data.textsByPage.get(page.id) ?? []}
        printMode
      />
    </div>
  {/each}
</div>

<style>
  .print-pages {
    max-width: 1000px;
    margin: 1rem auto 4rem;
    padding: 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  .print-page {
    width: 100%;
    aspect-ratio: var(--page-aspect);
  }

  @media print {
    :global(.print-hide) { display: none !important; }
    .print-pages {
      max-width: none;
      margin: 0;
      padding: 0;
      gap: 0;
    }
    .print-page {
      width: 100%;
      height: 100%;
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  }
</style>
