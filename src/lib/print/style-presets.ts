/**
 * Named bundles of layout + style settings. Applying a preset writes
 * each underlying column through the existing per-field update helpers.
 *
 * Paper size is intentionally *not* part of a preset — that's a
 * print-shop decision separate from visual styling.
 */
export interface StylePreset {
  id: string;
  label: string;
  description: string;
  slot_gap_px: number;
  page_padding_px: number;
  slot_corner_radius_px: number;
  page_bg_color: string;
  /** null = inherit app default monospace. */
  calendar_font_family: string | null;
}

export const STYLE_PRESETS: ReadonlyArray<StylePreset> = [
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Edge-to-edge photos, no rounded corners, white background.',
    slot_gap_px: 0,
    page_padding_px: 0,
    slot_corner_radius_px: 0,
    page_bg_color: '#ffffff',
    calendar_font_family: null,
  },
  {
    id: 'classic',
    label: 'Classic',
    description: 'Small gap between photos, off-white pages, serif calendar.',
    slot_gap_px: 4,
    page_padding_px: 8,
    slot_corner_radius_px: 0,
    page_bg_color: '#fbf7ee',
    calendar_font_family: 'Lora',
  },
  {
    id: 'polaroid',
    label: 'Polaroid',
    description: 'Rounded photo cards on white, handwritten calendar.',
    slot_gap_px: 14,
    page_padding_px: 16,
    slot_corner_radius_px: 12,
    page_bg_color: '#ffffff',
    calendar_font_family: 'Caveat',
  },
  {
    id: 'modern',
    label: 'Modern',
    description: 'Tight grid on dark, soft rounded corners, geometric sans.',
    slot_gap_px: 2,
    page_padding_px: 8,
    slot_corner_radius_px: 6,
    page_bg_color: '#1a1a1a',
    calendar_font_family: 'Inter',
  },
];
