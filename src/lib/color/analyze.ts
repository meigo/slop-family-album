/**
 * Load an image and compute its mean RGB on a downscaled canvas. Used by
 * the per-page auto-balance to estimate each photo's overall color cast.
 * Downscale to 64×64 → 4096 pixels per photo, fast enough to run on
 * dozens of photos without blocking.
 */
export interface BboxInOriginal {
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  /** Width/height of the ORIGINAL image (the bbox coords are in this
   *  space). The function scales them to whatever resolution the loaded
   *  URL actually decodes at (e.g., a thumbnail). */
  imgWidth: number;
  imgHeight: number;
}

/**
 * Sample a region of an image and return its mean RGB + mean chroma.
 * When `bbox` is provided, only the rectangle inside that bbox is
 * sampled — used by the page color-matcher to isolate face skin tones
 * from the variable background. When omitted, the whole frame is used.
 *
 * The bbox coords are in original-image pixels; the function rescales
 * them to the loaded image's actual dimensions (works whether you pass
 * the thumbnail URL or the original).
 */
export async function analyzeImageColor(
  url: string,
  bbox?: BboxInOriginal | null,
): Promise<{ r: number; g: number; b: number; chroma: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let sx = 0;
      let sy = 0;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;
      if (bbox && bbox.imgWidth > 0 && bbox.imgHeight > 0) {
        const xs = img.naturalWidth / bbox.imgWidth;
        const ys = img.naturalHeight / bbox.imgHeight;
        sx = Math.max(0, bbox.bbox_x * xs);
        sy = Math.max(0, bbox.bbox_y * ys);
        sw = Math.max(1, Math.min(img.naturalWidth - sx, bbox.bbox_w * xs));
        sh = Math.max(1, Math.min(img.naturalHeight - sy, bbox.bbox_h * ys));
      }
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
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      try {
        const data = ctx.getImageData(0, 0, w, h).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let chromaSum = 0;
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
