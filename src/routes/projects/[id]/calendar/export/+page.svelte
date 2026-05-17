<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import { paperForAspect } from '$lib/print/sizes';
  import { printWhenReady } from '$lib/print/prepare';
  import { Printer } from '@lucide/svelte';

  let { data } = $props();

  let printing = $state(false);
  let paper = $derived(paperForAspect(data.project.page_aspect));
  let pageAspect = $derived<'landscape' | 'portrait' | 'square' | null>(
    (data.project.page_aspect === 'landscape' || data.project.page_aspect === 'portrait' || data.project.page_aspect === 'square')
      ? data.project.page_aspect
      : null
  );

  async function exportPdf() {
    printing = true;
    try {
      await printWhenReady();
    } finally {
      printing = false;
    }
  }
</script>

<svelte:head>
  <title>{data.project.name} — calendar</title>
  {@html `<style>@media print { @page { size: ${paper.cssSize}; margin: 0; } }</style>`}
</svelte:head>

<div class="container-page print-hide" style="max-width: 1000px;">
  <PageHeader backHref={`/projects/${data.project.id}/calendar/review`}>
    <h1 class="text-xl font-medium">{data.project.name} — export calendar</h1>
  </PageHeader>

  {#if !data.selection || data.pages.length === 0}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">No calendar generated yet.</p>
    </section>
  {:else}
    <section class="surface-card mt-4 flex flex-wrap items-center gap-3">
      <span class="text-sm" style="color: var(--color-muted)">
        Paper: A4 {data.project.page_aspect ?? 'landscape (default)'}. Change the page format on the calendar review page.
      </span>
      <button type="button" class="btn-primary flex items-center gap-2" style="width: auto; margin-left: auto;" onclick={exportPdf} disabled={printing}>
        <Printer size={16} />
        {printing ? 'Preparing…' : 'Save as PDF'}
      </button>
      <p class="text-sm" style="color: var(--color-muted); flex: 1; min-width: 100%;">
        Click "Save as PDF" → choose "Save as PDF" as the destination in the print dialog.
      </p>
    </section>
  {/if}
</div>

<div class="print-pages">
  {#each data.pages as page (page.id)}
    <div class="print-page" style="--page-aspect: {paper.aspect};">
      <PageView
        templateId={page.template_id}
        slots={data.slotsByPage.get(page.id) ?? []}
        slotGapPx={data.project.slot_gap_px}
        pagePaddingPx={data.project.page_padding_px}
        pageBgColor={data.project.page_bg_color}
        {pageAspect}
        pageTitle={page.title}
        events={data.events}
        weekStart={data.project.week_start === 0 ? 0 : 1}
        texts={data.textsByPage.get(page.id) ?? []}
        printMode
      />
    </div>
  {/each}
</div>

<style>
  .print-pages {
    max-width: 1100px;
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
