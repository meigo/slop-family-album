import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import html2canvas from 'html2canvas-pro';
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
    scale = 4,
    jpegQuality = 0.92,
  } = opts;

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
    const canvas = await html2canvas(pageEls[i], {
      scale,
      backgroundColor: null, // preserve the element's bg
      useCORS: true,
      logging: false,
    });
    const imgData = canvas.toDataURL('image/jpeg', jpegQuality);
    if (i > 0) pdf.addPage([paperWidthMm, paperHeightMm], orientation);
    pdf.addImage(imgData, 'JPEG', 0, 0, paperWidthMm, paperHeightMm, undefined, 'FAST');
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
