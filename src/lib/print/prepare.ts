import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { domToCanvas } from 'modern-screenshot';
import jsPDF from 'jspdf';
import { loadedGoogleFontHrefs } from '$lib/text/fonts';
import { buildEmbeddedFontCss } from '$lib/text/fonts-embed';

/**
 * Pre-resolve every `cqi` unit in the subtree's inline styles to its
 * computed px equivalent, returning a function that restores the
 * original style strings. Why: inside modern-screenshot's
 * <foreignObject> SVG, container queries don't resolve against the
 * captured element's width — cqi falls back to the rasterized SVG
 * viewport, which is `scale`× larger than the live DOM. Without this
 * freeze, font-size and padding emitted as cqi render `scale`× bigger
 * in the PDF (e.g. 2.8cqi on a 1168px page → 33px live, but ~92px in
 * a 3300px canvas because cqi is computed against the SVG viewport).
 */
function freezeCqiToPx(root: HTMLElement): () => void {
  const props = [
    'font-size',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'left', 'top', 'right', 'bottom',
    'width', 'height', 'max-width', 'max-height',
  ];
  const targets: HTMLElement[] = [];
  if (root.getAttribute('style')?.includes('cqi')) targets.push(root);
  for (const el of root.querySelectorAll<HTMLElement>('[style*="cqi"]')) {
    targets.push(el);
  }
  const restores: Array<() => void> = [];
  for (const el of targets) {
    const computed = window.getComputedStyle(el);
    const originalStyle = el.getAttribute('style') ?? '';
    let changed = false;
    for (const prop of props) {
      const inlineValue = el.style.getPropertyValue(prop);
      if (inlineValue && inlineValue.includes('cqi')) {
        const computedValue = computed.getPropertyValue(prop);
        if (computedValue) {
          el.style.setProperty(prop, computedValue);
          changed = true;
        }
      }
    }
    if (changed) restores.push(() => el.setAttribute('style', originalStyle));
  }
  return () => { for (const fn of restores) fn(); };
}

/** Wait for fonts + images to settle. 30s hard cap so we never hang —
 *  Google Fonts CSS + binary fetch over a slow network can exceed the
 *  previous 5s ceiling, leaving modern-screenshot to walk a CSSOM
 *  whose @font-face rules haven't registered yet. */
async function awaitReady(): Promise<void> {
  const ready = (async () => {
    // Yield one frame so any just-injected <link rel="stylesheet"> has
    // a chance to start fetching before we ask document.fonts.ready —
    // otherwise the promise resolves instantly when no FontFaces have
    // registered yet, and we race past the font load.
    await new Promise((r) => requestAnimationFrame(r as FrameRequestCallback));
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch { /* proceed */ }
    }
    const imgs = Array.from(document.images);
    const pending = imgs.filter((img) => !img.complete);
    await Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          })
      )
    );
    await new Promise((r) => requestAnimationFrame(r as FrameRequestCallback));
  })();
  const timeout = new Promise<void>((r) => setTimeout(r, 30000));
  await Promise.race([ready, timeout]);
}

export interface ExportOptions {
  /** CSS selector matching the page elements to capture, in document order. */
  pageSelector: string;
  /** Paper width in millimeters. */
  paperWidthMm: number;
  /** Paper height in millimeters. */
  paperHeightMm: number;
  /** Suggested filename (without .pdf extension). */
  filename: string;
  /** Target rasterization DPI for the printed page. The actual
   *  modern-screenshot `scale` multiplier is computed at capture time
   *  from this DPI + paperWidthMm + the first matching element's
   *  on-screen width, so callers get the same DPI regardless of how
   *  small the preview thumbnails are. */
  targetDpi?: number;
  /** Hard override for the scale multiplier. When set, targetDpi is
   *  ignored. Useful for tests and one-off captures. */
  scale?: number;
  /** JPEG quality 0..1. */
  jpegQuality?: number;
  /** Map from asset:// URL (or whatever the renderer's <img> srcs point
   *  at) to absolute file path. When provided, fetchFn routes those
   *  reads through the `read_image_data_url` Tauri command — Rust does
   *  the file IO + base64 encoding, much faster than JS fetch+btoa. */
  imagePathMap?: Map<string, string>;
  /** Called after each page is rendered. `current` is 1-based. */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Capture every matching page element with html2canvas-pro, assemble
 * a PDF (one captured canvas per page), and write it to a user-chosen
 * path via the Tauri save dialog.
 *
 * Returns the saved path, or null if the user cancelled the dialog.
 */
export async function exportPagesToPdf(opts: ExportOptions): Promise<string | null> {
  await awaitReady();

  const {
    pageSelector,
    paperWidthMm,
    paperHeightMm,
    filename,
    targetDpi,
    scale: overrideScale,
    jpegQuality = 0.92,
    imagePathMap,
    onProgress,
  } = opts;

  // Cache: asset URL → data URL. Each photo is read at most once even if
  // it appears on multiple pages.
  const dataUrlCache = new Map<string, string>();

  const pageEls = Array.from(document.querySelectorAll(pageSelector)) as HTMLElement[];
  if (pageEls.length === 0) {
    throw new Error(`No pages matched "${pageSelector}"`);
  }

  // Pick the scale multiplier. Caller-overridden scale wins; otherwise
  // derive from targetDpi so the rasterized image hits the requested
  // print DPI regardless of how small the on-screen page is. Capped at
  // 1 so a tiny preview never produces a sub-1-scale capture.
  const onScreenWidthPx = pageEls[0].getBoundingClientRect().width;
  const scale = overrideScale ?? (() => {
    if (!targetDpi || onScreenWidthPx <= 0) return 3;
    const targetPx = (paperWidthMm / 25.4) * targetDpi;
    return Math.max(1, Math.ceil(targetPx / onScreenWidthPx));
  })();

  const orientation: 'portrait' | 'landscape' =
    paperWidthMm >= paperHeightMm ? 'landscape' : 'portrait';

  // Pre-build a self-contained @font-face stylesheet with data: URLs
  // for every Google Font loaded into the page. Passing this as
  // `font.cssText` to modern-screenshot bypasses its CSSOM walk,
  // which silently fails on cross-origin <link> stylesheets (the
  // browser blocks cssRules access on sheets injected without
  // crossorigin="anonymous"). Without this, every text overlay and
  // calendar grid renders in a system fallback font in the PDF.
  const fontCssText = await buildEmbeddedFontCss(loadedGoogleFontHrefs());

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [paperWidthMm, paperHeightMm],
    compress: true,
  });

  for (let i = 0; i < pageEls.length; i++) {
    console.log(`[pdf-export] page ${i + 1}/${pageEls.length} starting…`);
    const t0 = performance.now();
    const restoreCqi = freezeCqiToPx(pageEls[i]);
    try {
    const canvas = await domToCanvas(pageEls[i], {
      scale,
      backgroundColor: null,
      timeout: 60000,
      // Hand modern-screenshot the pre-inlined @font-face CSS so it
      // skips the cross-origin CSSOM walk that silently drops Google
      // Fonts. preferredFormat keeps the woff2 url() entries (the
      // library filters out non-matching formats from cssText).
      font: { cssText: fontCssText, preferredFormat: 'woff2' },
      // Leaving features at default — fixSvgXmlDecode in particular is
      // needed on WKWebView (macOS) for embedded photos to render at all.
      // Note: routing photo reads through a Tauri command turned out to
      // sometimes produce data URLs that the SVG <foreignObject> didn't
      // render (photos missing in the saved PDF). Falling back to
      // modern-screenshot's built-in fetch+base64 path until we can
      // root-cause that.
      progress: (cur, total) =>
        console.log(`[pdf-export]   asset ${cur}/${total}`),
    });
    console.log(`[pdf-export] page ${i + 1} done in ${Math.round(performance.now() - t0)}ms (canvas ${canvas.width}×${canvas.height})`);
    const imgData = canvas.toDataURL('image/jpeg', jpegQuality);
    if (i > 0) pdf.addPage([paperWidthMm, paperHeightMm], orientation);
    pdf.addImage(imgData, 'JPEG', 0, 0, paperWidthMm, paperHeightMm, undefined, 'FAST');
    onProgress?.(i + 1, pageEls.length);
    // Yield to the browser between pages so the UI gets to repaint
    // (otherwise the progress text wouldn't update visibly).
    await new Promise((r) => setTimeout(r, 16));
    } finally {
      restoreCqi();
    }
  }

  const path = await save({
    defaultPath: `${filename}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!path) return null;

  const ab = pdf.output('arraybuffer');
  const bytes = Array.from(new Uint8Array(ab));
  await invoke('write_pdf', { path, bytes });

  return path;
}
