<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageView from '$lib/components/PageView.svelte';
  import { paperForSize } from '$lib/print/sizes';
  import { exportPagesToPdf } from '$lib/print/prepare';
  import { loadGoogleFont } from '$lib/text/fonts';
  import { parseStyle } from '$lib/text/style';
  import { Printer } from '@lucide/svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';

  let { data } = $props();

  // Preload every text-overlay font on mount so @font-face rules are
  // registered (and binaries cached) by the time the user clicks Save.
  // Without this, fonts load lazily as each TextOverlay mounts, and
  // awaitReady's fonts.ready can race-resolve before the dynamically
  // injected <link> stylesheets have registered any FontFaces —
  // modern-screenshot then walks an empty CSSOM and the PDF falls
  // back to system fonts.
  onMount(() => {
    const seen = new Set<string>();
    for (const texts of data.textsByPage.values()) {
      for (const text of texts) {
        const style = parseStyle(text.style_json);
        if (!style) continue;
        const key = `${style.fontFamily}:${style.fontWeight}`;
        if (seen.has(key)) continue;
        seen.add(key);
        loadGoogleFont(style.fontFamily, [style.fontWeight]);
      }
    }
  });

  let exporting = $state(false);
  let savedPath = $state<string | null>(null);
  let error = $state<string | null>(null);
  let quality = $state<'low' | 'medium' | 'high'>('medium');
  let progress = $state<{ current: number; total: number } | null>(null);
  let paper = $derived(paperForSize(data.project.page_size_w_mm, data.project.page_size_h_mm));

  function qualityToParams(q: 'low' | 'medium' | 'high'): { targetDpi: number; jpegQuality: number } {
    if (q === 'low')  return { targetDpi: 170, jpegQuality: 0.85 };
    if (q === 'high') return { targetDpi: 340, jpegQuality: 0.96 };
    return { targetDpi: 255, jpegQuality: 0.92 };
  }

  async function exportPdf() {
    exporting = true;
    savedPath = null;
    error = null;
    progress = null;
    try {
      const w = data.project.page_size_w_mm;
      const h = data.project.page_size_h_mm;
      const { targetDpi, jpegQuality } = qualityToParams(quality);
      // Build a lookup: the asset:// URL each <img> will use → original
      // file path, so the renderer can ask Rust to read+encode quickly.
      const imagePathMap = new Map<string, string>();
      for (const page of data.pages) {
        for (const slot of data.slotsByPage.get(page.id) ?? []) {
          if (slot.path) imagePathMap.set(convertFileSrc(slot.path), slot.path);
        }
      }
      const path = await exportPagesToPdf({
        pageSelector: '.print-page',
        paperWidthMm: w,
        paperHeightMm: h,
        filename: `${data.project.name} — album`,
        targetDpi,
        jpegQuality,
        imagePathMap,
        onProgress: (current, total) => { progress = { current, total }; },
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
  <title>{data.project.name} — album</title>
</svelte:head>

<div class="container-page print-hide">
  <PageHeader backHref={`/projects/${data.project.id}/album/review`}>
    <h1 class="text-xl font-medium">Export album as PDF</h1>
  </PageHeader>

  <p class="text-sm mt-1" style="color: var(--color-muted)">
    Rasterizes every page below into a single PDF and writes it to disk —
    no print dialog. You'll be asked where to save.
  </p>

  {#if !data.selection || data.pages.length === 0}
    <section class="surface-card mt-4">
      <p style="color: var(--color-muted)">No album generated yet.</p>
    </section>
  {:else}
    <section class="surface-card mt-4">
      <dl class="grid gap-2 text-sm" style="grid-template-columns: max-content 1fr; align-items: center;">
        <dt style="color: var(--color-muted)">Paper size</dt>
        <dd>
          {data.project.page_size_w_mm}×{data.project.page_size_h_mm}mm
          <span style="color: var(--color-muted)">·</span>
          <a href={`/projects/${data.project.id}/album/review`} class="text-xs" style="color: var(--color-muted)">change on the review page</a>
        </dd>

        <dt style="color: var(--color-muted)">Pages</dt>
        <dd>{data.pages.length}</dd>

        <dt style="color: var(--color-muted)">Quality</dt>
        <dd>
          <select bind:value={quality} class="input-base" style="padding: 0.25rem 0.5rem; width: auto;">
            <option value="low">Low — 170 DPI</option>
            <option value="medium">Medium — 255 DPI</option>
            <option value="high">High — 340 DPI</option>
          </select>
        </dd>
      </dl>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" class="btn-primary flex items-center gap-2" onclick={exportPdf} disabled={exporting}>
          <Printer size={16} />
          {#if exporting && progress}
            Page {progress.current} / {progress.total}…
          {:else if exporting}
            Preparing…
          {:else}
            Save as PDF
          {/if}
        </button>
        {#if savedPath}
          <span class="text-sm" style="color: var(--color-success)">Saved to {savedPath}</span>
        {/if}
        {#if error}
          <span class="text-sm" style="color: var(--color-danger)">Failed: {error}</span>
        {/if}
      </div>
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
        slotCornerRadiusPx={data.project.slot_corner_radius_px}
        pageWidthMm={data.project.page_size_w_mm}
        pageHeightMm={data.project.page_size_h_mm}
        texts={data.textsByPage.get(page.id) ?? []}
        printMode
      />
    </div>
  {/each}
</div>

<style>
  .print-pages {
    max-width: 1200px;
    margin: 1rem auto 4rem;
    padding: 0 1rem;
    display: grid;
    /* One page per row at the review page's working width so cqi-based
     *  gaps render above 1 CSS px in the DOM. The rasterizer captures
     *  what the DOM lays out — sub-pixel gaps that get rounded away on
     *  a small thumbnail can't be recovered by the scale multiplier. */
    grid-template-columns: 1fr;
    gap: 1.5rem;
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
