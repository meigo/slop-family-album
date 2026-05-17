/**
 * Wait for the renderer to be print-ready (all fonts loaded, all images
 * fetched), then open the browser's native print dialog. The user picks
 * "Save as PDF" as the destination — we don't write the file directly.
 */
export async function printWhenReady(): Promise<void> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
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

  // Let the browser settle final layout before snapshotting for print.
  await new Promise((r) => requestAnimationFrame(r as FrameRequestCallback));
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
