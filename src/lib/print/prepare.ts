import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { domToCanvas } from 'modern-screenshot';
import jsPDF from 'jspdf';

/** Wait for fonts + images to settle. 5s hard cap so we never hang. */
async function awaitReady(): Promise<void> {
  const ready = (async () => {
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
  const timeout = new Promise<void>((r) => setTimeout(r, 5000));
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
  /** Rasterization scale relative to the on-screen size. Default 4 —
   *  text stays crisp at A4 print size; trade-off is larger file +
   *  more memory during capture. */
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
    scale = 2,
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

  const orientation: 'portrait' | 'landscape' =
    paperWidthMm >= paperHeightMm ? 'landscape' : 'portrait';

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [paperWidthMm, paperHeightMm],
    compress: true,
  });

  for (let i = 0; i < pageEls.length; i++) {
    console.log(`[pdf-export] page ${i + 1}/${pageEls.length} starting…`);
    const t0 = performance.now();
    const canvas = await domToCanvas(pageEls[i], {
      scale,
      backgroundColor: null,
      timeout: 60000,
      // Font embedding stays at the default (on). document.fonts.ready
      // only guarantees fonts are registered for the *live* DOM render;
      // the captured SVG <foreignObject> is its own context and needs
      // the @font-face rules + font binaries inlined or the PDF falls
      // back to system fonts.
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
