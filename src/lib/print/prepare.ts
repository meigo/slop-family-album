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
      // Disable WebKit-specific retry loop and per-call web-font
      // re-embedding. Fonts are already loaded in the main document by
      // printWhenReady; the SVG <foreignObject> inherits them.
      features: {
        embedWebFont: false,
        fixSvgXmlDecode: false,
      },
      fetchFn: async (url) => {
        const tStart = performance.now();
        const cached = dataUrlCache.get(url);
        if (cached) {
          console.log(`[pdf-export]   cache hit (${Math.round(performance.now() - tStart)}ms)`);
          return cached;
        }
        const path = imagePathMap?.get(url);
        if (path) {
          try {
            const dataUrl = await invoke<string>('read_image_data_url', { path });
            const dt = Math.round(performance.now() - tStart);
            const fname = path.split('/').slice(-1)[0];
            console.log(`[pdf-export]   rust read ${dt}ms ${fname}`);
            dataUrlCache.set(url, dataUrl);
            return dataUrl;
          } catch (e) {
            console.warn('[pdf-export] read_image_data_url failed for', path, e);
            return false;
          }
        }
        console.log(`[pdf-export]   MISS (map has ${imagePathMap?.size ?? 0}): ${url.slice(0, 100)}`);
        return false;
      },
      progress: (cur, total) =>
        console.log(`[pdf-export]   asset ${cur}/${total}`),
    });
    console.log(`[pdf-export] page ${i + 1} done in ${Math.round(performance.now() - t0)}ms (canvas ${canvas.width}×${canvas.height})`);
    const imgData = canvas.toDataURL('image/jpeg', jpegQuality);
    if (i > 0) pdf.addPage([paperWidthMm, paperHeightMm], orientation);
    pdf.addImage(imgData, 'JPEG', 0, 0, paperWidthMm, paperHeightMm, undefined, 'FAST');
    // Yield to the browser between pages so accumulated sandbox iframes,
    // image decoders, and SVG parser state can release. Without this,
    // pages 3+ stall for tens of seconds while the renderer thrashes.
    await new Promise((r) => setTimeout(r, 100));
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
