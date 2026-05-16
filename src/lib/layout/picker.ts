import { TEMPLATES, type Template } from './templates';

/**
 * Pick an album template by photo count and orientation mix.
 * - 1 → hero-1
 * - 2 landscape pair → pair-v (stacked)
 * - 2 portrait or mixed → pair-h (side-by-side)
 * - 3+ → trio-asym (caller chunks if >3)
 */
export function pickAlbumTemplate(n: number, orientations: Array<'portrait' | 'landscape'>): Template {
  if (n === 1) return TEMPLATES['hero-1'];
  if (n === 2) {
    const allLandscape = orientations.every((o) => o === 'landscape');
    if (allLandscape) return TEMPLATES['pair-v'];
    return TEMPLATES['pair-h'];
  }
  if (n >= 3) return TEMPLATES['trio-asym'];
  return TEMPLATES['hero-1'];
}

export function pickCalendarTemplate(): Template {
  return TEMPLATES['cal-month'];
}
