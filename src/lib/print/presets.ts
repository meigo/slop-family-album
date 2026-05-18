/**
 * Catalog of paper-size presets covering the sizes online photo-book and
 * print services actually offer (Saal Digital, Cewe, Shutterfly, Mixbook,
 * MPix, Blurb). Roughly grouped by orientation; metric and imperial mixed
 * because users in either market typically know one set well.
 *
 * Stored on the project as page_size_w_mm × page_size_h_mm so the catalog
 * can grow without schema changes.
 */
export interface PaperPreset {
  id: string;
  label: string;
  group: 'square' | 'landscape' | 'portrait';
  width_mm: number;
  height_mm: number;
}

export const PAPER_PRESETS: ReadonlyArray<PaperPreset> = [
  // A-series + Letter (common reference points)
  { id: 'a4-landscape', label: 'A4 landscape — 297×210mm', group: 'landscape', width_mm: 297, height_mm: 210 },
  { id: 'a4-portrait', label: 'A4 portrait — 210×297mm', group: 'portrait', width_mm: 210, height_mm: 297 },
  { id: 'us-letter-landscape', label: 'US Letter landscape — 279×216mm (11×8.5")', group: 'landscape', width_mm: 279, height_mm: 216 },
  { id: 'us-letter-portrait', label: 'US Letter portrait — 216×279mm (8.5×11")', group: 'portrait', width_mm: 216, height_mm: 279 },

  // Square photo books — metric (Saal, Cewe, Photobox EU)
  { id: 'sq-20cm', label: 'Square 20×20cm', group: 'square', width_mm: 200, height_mm: 200 },
  { id: 'sq-21cm', label: 'Square 21×21cm', group: 'square', width_mm: 210, height_mm: 210 },
  { id: 'sq-28cm', label: 'Square 28×28cm', group: 'square', width_mm: 280, height_mm: 280 },
  { id: 'sq-30cm', label: 'Square 30×30cm', group: 'square', width_mm: 300, height_mm: 300 },

  // Square photo books — imperial (Shutterfly, Mixbook, Blurb US)
  { id: 'sq-8in', label: 'Square 8×8" (203×203mm)', group: 'square', width_mm: 203, height_mm: 203 },
  { id: 'sq-10in', label: 'Square 10×10" (254×254mm)', group: 'square', width_mm: 254, height_mm: 254 },
  { id: 'sq-12in', label: 'Square 12×12" (305×305mm)', group: 'square', width_mm: 305, height_mm: 305 },

  // Landscape photo books — metric
  { id: 'ls-30x20cm', label: 'Landscape 30×20cm', group: 'landscape', width_mm: 300, height_mm: 200 },
  { id: 'ls-28x21cm', label: 'Landscape 28×21cm', group: 'landscape', width_mm: 280, height_mm: 210 },

  // Portrait photo books — metric
  { id: 'pt-21x28cm', label: 'Portrait 21×28cm', group: 'portrait', width_mm: 210, height_mm: 280 },
  { id: 'pt-20x28cm', label: 'Portrait 20×28cm', group: 'portrait', width_mm: 200, height_mm: 280 },
];

/** Find the preset whose dimensions match (w, h) exactly. Used by the UI
 *  to highlight which option corresponds to the project's current size. */
export function findPreset(width_mm: number, height_mm: number): PaperPreset | null {
  return PAPER_PRESETS.find((p) => p.width_mm === width_mm && p.height_mm === height_mm) ?? null;
}
