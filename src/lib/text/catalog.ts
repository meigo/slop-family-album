export type FontCategory = 'sans-serif' | 'serif' | 'handwriting' | 'display' | 'monospace';

export interface FontMeta {
  family: string;
  category: FontCategory;
  weights: number[];   // available weights on Google Fonts
}

export const FONT_CATALOG: FontMeta[] = [
  // Sans-serif
  { family: 'Roboto',             category: 'sans-serif', weights: [300, 400, 500, 700] },
  { family: 'Open Sans',          category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Lato',               category: 'sans-serif', weights: [300, 400, 700] },
  { family: 'Montserrat',         category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Inter',              category: 'sans-serif', weights: [400, 500, 700] },
  { family: 'Nunito',             category: 'sans-serif', weights: [400, 600, 700] },
  // Serif
  { family: 'Playfair Display',   category: 'serif', weights: [400, 700, 900] },
  { family: 'Merriweather',       category: 'serif', weights: [300, 400, 700] },
  { family: 'Lora',               category: 'serif', weights: [400, 700] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [400, 600, 700] },
  // Handwriting
  { family: 'Dancing Script',     category: 'handwriting', weights: [400, 700] },
  { family: 'Pacifico',           category: 'handwriting', weights: [400] },
  { family: 'Caveat',             category: 'handwriting', weights: [400, 700] },
  { family: 'Sacramento',         category: 'handwriting', weights: [400] },
  // Display
  { family: 'Bebas Neue',         category: 'display', weights: [400] },
  { family: 'Oswald',             category: 'display', weights: [400, 700] },
  { family: 'Anton',              category: 'display', weights: [400] },
  // Monospace
  { family: 'Inconsolata',        category: 'monospace', weights: [400, 700] },
  { family: 'JetBrains Mono',     category: 'monospace', weights: [400, 700] },
];

export function findFont(family: string): FontMeta | null {
  return FONT_CATALOG.find((f) => f.family === family) ?? null;
}
