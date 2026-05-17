<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import { paperForAspect } from '$lib/print/sizes';
  import { exportPagesToPdf } from '$lib/print/prepare';
  import { Printer } from '@lucide/svelte';

  let { data } = $props();

  let exporting = $state(false);
  let savedPath = $state<string | null>(null);
  let error = $state<string | null>(null);
  let quality = $state<'low' | 'medium' | 'high'>('medium');
  let paper = $derived(paperForAspect(data.project.page_aspect));

  function qualityToParams(q: 'low' | 'medium' | 'high'): { scale: number; jpegQuality: number } {
    if (q === 'low')  return { scale: 1.5, jpegQuality: 0.85 };
    if (q === 'high') return { scale: 3, jpegQuality: 0.96 };
    return { scale: 2, jpegQuality: 0.92 };
  }
  let pageAspect = $derived<'landscape' | 'portrait' | 'square' | null>(
    (data.project.page_aspect === 'landscape' || data.project.page_aspect === 'portrait' || data.project.page_aspect === 'square')
      ? data.project.page_aspect
      : null
  );

  function parseMm(cssSize: string): { w: number; h: number } {
    const m = /^([0-9.]+)mm\s+([0-9.]+)mm$/.exec(cssSize);
    if (!m) return { w: 297, h: 210 };
    return { w: Number(m[1]), h: Number(m[2]) };
  }

  async function exportPdf() {
    exporting = true;
    savedPath = null;
    error = null;
    try {
      const { w, h } = parseMm(paper.cssSize);
      const { scale, jpegQuality } = qualityToParams(quality);
      const path = await exportPagesToPdf({
        pageSelector: '.print-page',
        paperWidthMm: w,
        paperHeightMm: h,
        filename: `${data.project.name} — calendar`,
        scale,
        jpegQuality,
      });
      if (path) savedPath = path;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      exporting = false;
    }
  }
</script>

<svelte:head>
  <title>{data.project.name} — calendar</title>
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
      <label class="text-sm flex items-center gap-2">
        Quality:
        <select bind:value={quality} class="input-base" style="padding: 0.25rem 0.5rem; width: auto;">
          <option value="low">Low (~130 DPI, fastest)</option>
          <option value="medium">Medium (~170 DPI)</option>
          <option value="high">High (~255 DPI, slower)</option>
        </select>
      </label>
      <button type="button" class="btn-primary flex items-center gap-2" style="width: auto; margin-left: auto;" onclick={exportPdf} disabled={exporting}>
        <Printer size={16} />
        {exporting ? 'Generating PDF…' : 'Save as PDF'}
      </button>
      <p class="text-sm" style="color: var(--color-muted); flex: 1; min-width: 100%;">
        Generates the PDF directly — no print dialog. You'll be asked where to save the file.
      </p>
      {#if savedPath}
        <p class="text-sm" style="color: var(--color-success); flex: 1; min-width: 100%;">
          Saved to {savedPath}
        </p>
      {/if}
      {#if error}
        <p class="text-sm" style="color: var(--color-danger); flex: 1; min-width: 100%;">
          Failed: {error}
        </p>
      {/if}
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
