/**
 * Layout template definitions. Each template specifies:
 * - id: short string used as page.template_id
 * - slot_count: how many photos it places
 * - slots: array of {x, y, w, h} in unit-square coordinates (0..1)
 * - aspect: page aspect ratio
 * - label: human-readable for the template-swap dropdown
 *
 * Phase 3c expands from 4 album templates to 10. cal-month unchanged.
 */

export interface SlotLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Template {
  id: string;
  slot_count: number;
  slots: SlotLayout[];
  aspect: 'square' | 'landscape';
  label: string;
}

export const TEMPLATES: Record<string, Template> = {
  'hero-1': {
    id: 'hero-1',
    slot_count: 1,
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    aspect: 'square',
    label: '1 photo (full)',
  },
  'pair-h': {
    id: 'pair-h',
    slot_count: 2,
    slots: [
      { x: 0,   y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
    aspect: 'square',
    label: '2 photos (side by side)',
  },
  'pair-v': {
    id: 'pair-v',
    slot_count: 2,
    slots: [
      { x: 0, y: 0,   w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
    aspect: 'square',
    label: '2 photos (stacked)',
  },
  'pair-asym-h': {
    id: 'pair-asym-h',
    slot_count: 2,
    slots: [
      { x: 0,    y: 0, w: 0.66, h: 1 },
      { x: 0.66, y: 0, w: 0.34, h: 1 },
    ],
    aspect: 'square',
    label: '2 photos (hero + small, side)',
  },
  'trio-asym': {
    id: 'trio-asym',
    slot_count: 3,
    slots: [
      { x: 0,    y: 0,    w: 0.66, h: 1 },
      { x: 0.66, y: 0,    w: 0.34, h: 0.5 },
      { x: 0.66, y: 0.5,  w: 0.34, h: 0.5 },
    ],
    aspect: 'square',
    label: '3 photos (hero + 2 stacked)',
  },
  'trio-h': {
    id: 'trio-h',
    slot_count: 3,
    slots: [
      { x: 0,     y: 0, w: 0.333, h: 1 },
      { x: 0.333, y: 0, w: 0.334, h: 1 },
      { x: 0.667, y: 0, w: 0.333, h: 1 },
    ],
    aspect: 'square',
    label: '3 photos (vertical strips)',
  },
  'trio-v': {
    id: 'trio-v',
    slot_count: 3,
    slots: [
      { x: 0, y: 0,     w: 1, h: 0.333 },
      { x: 0, y: 0.333, w: 1, h: 0.334 },
      { x: 0, y: 0.667, w: 1, h: 0.333 },
    ],
    aspect: 'square',
    label: '3 photos (horizontal strips)',
  },
  'quad-grid': {
    id: 'quad-grid',
    slot_count: 4,
    slots: [
      { x: 0,   y: 0,   w: 0.5, h: 0.5 },
      { x: 0.5, y: 0,   w: 0.5, h: 0.5 },
      { x: 0,   y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
    aspect: 'square',
    label: '4 photos (2×2 grid)',
  },
  'quad-asym': {
    id: 'quad-asym',
    slot_count: 4,
    slots: [
      { x: 0,    y: 0,    w: 0.66, h: 0.66 },
      { x: 0.66, y: 0,    w: 0.34, h: 0.33 },
      { x: 0.66, y: 0.33, w: 0.34, h: 0.33 },
      { x: 0,    y: 0.66, w: 1,    h: 0.34 },
    ],
    aspect: 'square',
    label: '4 photos (hero + 3)',
  },
  'six-grid': {
    id: 'six-grid',
    slot_count: 6,
    slots: [
      { x: 0,     y: 0,     w: 0.333, h: 0.5 },
      { x: 0.333, y: 0,     w: 0.334, h: 0.5 },
      { x: 0.667, y: 0,     w: 0.333, h: 0.5 },
      { x: 0,     y: 0.5,   w: 0.333, h: 0.5 },
      { x: 0.333, y: 0.5,   w: 0.334, h: 0.5 },
      { x: 0.667, y: 0.5,   w: 0.333, h: 0.5 },
    ],
    aspect: 'square',
    label: '6 photos (3×2 grid)',
  },
  'cal-month': {
    id: 'cal-month',
    slot_count: 1,
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    aspect: 'landscape',
    label: '1 photo (calendar month)',
  },
};

/**
 * Templates compatible with album pages (aspect: square). Used to
 * populate the template-swap dropdown for album pages.
 */
export function albumTemplates(): Template[] {
  return Object.values(TEMPLATES).filter((t) => t.aspect === 'square');
}

/**
 * Templates compatible with calendar pages (aspect: landscape).
 */
export function calendarTemplates(): Template[] {
  return Object.values(TEMPLATES).filter((t) => t.aspect === 'landscape');
}

export function getTemplate(id: string): Template {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
