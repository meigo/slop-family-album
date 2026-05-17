export interface PaperSize {
  id: string;
  label: string;
  /** CSS @page size, e.g. "297mm 210mm" or "8.5in 11in". */
  cssSize: string;
  /** Aspect ratio (width / height) — sizes the on-screen preview to match. */
  aspect: number;
}

export const PAPER_SIZES_LANDSCAPE: PaperSize[] = [
  { id: 'a4-landscape',     label: 'A4 landscape (297×210mm)',   cssSize: '297mm 210mm',   aspect: 297 / 210 },
  { id: 'letter-landscape', label: 'Letter landscape (11×8.5″)', cssSize: '11in 8.5in',    aspect: 11 / 8.5 },
];

export const PAPER_SIZES_SQUARE: PaperSize[] = [
  { id: 'a4-square',     label: 'A4 square (210×210mm)',     cssSize: '210mm 210mm',   aspect: 1 },
  { id: 'letter-square', label: 'Letter square (8.5×8.5″)',  cssSize: '8.5in 8.5in',   aspect: 1 },
];

export function findSize(sizes: PaperSize[], id: string): PaperSize {
  return sizes.find((s) => s.id === id) ?? sizes[0];
}
