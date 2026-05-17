/**
 * Wait for the renderer to be print-ready (all fonts loaded, all images
 * fetched), then open the browser's native print dialog. The user picks
 * "Save as PDF" as the destination — we don't write the file directly.
 *
 * Hard-capped at 5s total so the export never hangs indefinitely on a
 * stuck font or image event in the Tauri webview.
 */
export async function printWhenReady(): Promise<void> {
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
    // Let the browser settle final layout.
    await new Promise((r) => requestAnimationFrame(r as FrameRequestCallback));
  })();
  const timeout = new Promise<void>((r) => setTimeout(r, 5000));
  await Promise.race([ready, timeout]);
  window.print();
}

/**
 * Inject (or replace) the @page rule for the print output. Browser uses
 * the most recently declared @page rule, so we replace any previous one.
 */
export function setPrintPageSize(cssSize: string): void {
  const id = 'print-page-size-style';
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `@media print { @page { size: ${cssSize}; margin: 0; } }`;
  document.head.appendChild(style);
}
