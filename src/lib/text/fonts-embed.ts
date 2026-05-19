/**
 * Builds a self-contained @font-face stylesheet for modern-screenshot's
 * `font.cssText` option.
 *
 * Why this exists: modern-screenshot's default font-embed walks
 * document.styleSheets and reads `cssRules` on every sheet, but
 * cross-origin sheets injected without `crossorigin="anonymous"` (which
 * is how we load Google Fonts via <link>) throw SecurityError on
 * cssRules access. The library silently catches and skips them — the
 * @font-face rules never reach the embed pass, so the rasterized SVG
 * has no font definitions and the PDF falls back to system fonts.
 *
 * Passing pre-built cssText short-circuits the CSSOM walk entirely
 * (see modern-screenshot's src/embed-web-font.ts). The CSS we hand it
 * must have data: URLs for every src — the library does not fetch or
 * rewrite urls inside cssText.
 */

const cssCache = new Map<string, string>();
const dataUrlCache = new Map<string, string>();

async function fetchGoogleFontsCss(href: string): Promise<string> {
  const cached = cssCache.get(href);
  if (cached !== undefined) return cached;
  const res = await fetch(href);
  const text = await res.text();
  cssCache.set(href, text);
  return text;
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const cached = dataUrlCache.get(url);
  if (cached !== undefined) return cached;
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  // Chunked btoa to avoid stack overflow on multi-MB binaries.
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  const dataUrl = `data:font/woff2;base64,${btoa(binary)}`;
  dataUrlCache.set(url, dataUrl);
  return dataUrl;
}

/**
 * Fetch each href's CSS, find every gstatic.com src url(...) reference,
 * fetch the binary, replace url(...) with a data: URL. Returns the
 * concatenated, fully-inlined CSS suitable for `font.cssText`.
 *
 * Repeated calls hit the in-memory caches; first call on a cold page
 * pays the network cost (Google Fonts CSS is small, woff2 binaries are
 * ~20-80 KB each).
 */
export async function buildEmbeddedFontCss(hrefs: readonly string[]): Promise<string> {
  if (hrefs.length === 0) return '';
  const cssChunks = await Promise.all(hrefs.map(fetchGoogleFontsCss));
  const combined = cssChunks.join('\n');

  const urlRe = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g;
  const urls = new Set<string>();
  for (const m of combined.matchAll(urlRe)) urls.add(m[1]);

  const replacements = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (u) => { replacements.set(u, await fetchAsDataUrl(u)); })
  );

  return combined.replace(urlRe, (_, u) => `url(${replacements.get(u)})`);
}
