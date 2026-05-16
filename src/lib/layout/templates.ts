/**
 * Layout template definitions. Each template specifies:
 * - id: short string used as page.template_id
 * - slot_count: how many photos it places
 * - slots: array of {x, y, w, h} in unit-square coordinates (0..1)
 *
 * PageView.svelte positions <img> elements absolutely within the page
 * container using these coordinates.
 *
 * v1 ships 4 album templates + 1 calendar template. Phase 3c may add
 * six-grid, pano-band, month-divider if user demand surfaces.
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
}

export const TEMPLATES: Record<string, Template> = {
  'hero-1': {
    id: 'hero-1',
    slot_count: 1,
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    aspect: 'square',
  },
  'pair-h': {
    id: 'pair-h',
    slot_count: 2,
    slots: [
      { x: 0,   y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
    aspect: 'square',
  },
  'pair-v': {
    id: 'pair-v',
    slot_count: 2,
    slots: [
      { x: 0, y: 0,   w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
    aspect: 'square',
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
  },
  'cal-month': {
    id: 'cal-month',
    slot_count: 1,
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    aspect: 'landscape',
  },
};

export function getTemplate(id: string): Template {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}
