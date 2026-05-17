/**
 * Load an image and compute its mean RGB on a downscaled canvas. Used by
 * the per-page auto-balance to estimate each photo's overall color cast.
 * Downscale to 64×64 → 4096 pixels per photo, fast enough to run on
 * dozens of photos without blocking.
 */
export async function analyzeImageColor(
  url: string,
): Promise<{ r: number; g: number; b: number; chroma: number }> {
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
        let chromaSum = 0; // per-pixel (max-min); proxy for HSV saturation
        const n = w * h;
        for (let i = 0; i < data.length; i += 4) {
          const dr = data[i];
          const dg = data[i + 1];
          const db = data[i + 2];
          r += dr;
          g += dg;
          b += db;
          chromaSum += Math.max(dr, dg, db) - Math.min(dr, dg, db);
        }
        resolve({ r: r / n, g: g / n, b: b / n, chroma: chromaSum / n });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}
