/** Map a project's page_aspect (or null fallback) to a CSS @page size
 *  string + numeric aspect for the on-screen preview. A4 always. */
export function paperForAspect(aspect: 'landscape' | 'portrait' | 'square' | null | string): {
  cssSize: string;
  aspect: number;
} {
  if (aspect === 'portrait') return { cssSize: '210mm 297mm', aspect: 210 / 297 };
  if (aspect === 'square')   return { cssSize: '210mm 210mm', aspect: 1 };
  // Default and 'landscape': A4 landscape.
  return { cssSize: '297mm 210mm', aspect: 297 / 210 };
}
