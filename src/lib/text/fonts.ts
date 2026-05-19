import { FONT_CATALOG } from './catalog';

const loaded = new Set<string>();
const loadedHrefs: string[] = [];

/**
 * Inject a <link rel="stylesheet"> to Google Fonts for the given family +
 * weights. Deduped by family+weights signature. No-op on SSR.
 */
export function loadGoogleFont(family: string, weights?: number[]): void {
  if (typeof document === 'undefined') return;
  const ws = weights && weights.length > 0
    ? [...new Set(weights)].sort((a, b) => a - b)
    : (FONT_CATALOG.find((f) => f.family === family)?.weights ?? [400]);
  const key = `${family}:${ws.join(',')}`;
  if (loaded.has(key)) return;
  loaded.add(key);
  const familyParam = family.replace(/ /g, '+');
  const weightsParam = ws.join(';');
  const href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weightsParam}&display=swap`;
  loadedHrefs.push(href);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/** Every Google Fonts CSS href requested via loadGoogleFont so far.
 *  Used by the PDF export to pre-inline fonts before rasterization. */
export function loadedGoogleFontHrefs(): readonly string[] {
  return loadedHrefs;
}
