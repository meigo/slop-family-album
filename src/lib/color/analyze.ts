/**
 * Load an image and compute its mean RGB on a downscaled canvas. Used by
 * the per-page auto-balance to estimate each photo's overall color cast.
 * Downscale to 64×64 → 4096 pixels per photo, fast enough to run on
 * dozens of photos without blocking.
 */
export async function analyzeImageColor(url: string): Promise<{ r: number; g: number; b: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = 64;
      const h = 64;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas 2d context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const data = ctx.getImageData(0, 0, w, h).data;
        let r = 0;
        let g = 0;
        let b = 0;
        const n = w * h;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        resolve({ r: r / n, g: g / n, b: b / n });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}
