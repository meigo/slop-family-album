export interface SlotTransform {
  /** Object-position X in percent (0..100). 50 = centered. */
  objectPositionX: number;
  /** Object-position Y in percent (0..100). */
  objectPositionY: number;
  /** Zoom factor. 1 = exactly object-fit: cover; >1 zooms in. */
  scale: number;
}

export const IDENTITY_TRANSFORM: SlotTransform = { objectPositionX: 50, objectPositionY: 50, scale: 1 };

export function parseTransform(json: string | null): SlotTransform | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (
      !Number.isFinite(parsed.objectPositionX) ||
      !Number.isFinite(parsed.objectPositionY) ||
      !Number.isFinite(parsed.scale) ||
      parsed.scale <= 0 ||
      parsed.objectPositionX < 0 || parsed.objectPositionX > 100 ||
      parsed.objectPositionY < 0 || parsed.objectPositionY > 100
    ) {
      return null;
    }
    return {
      objectPositionX: parsed.objectPositionX,
      objectPositionY: parsed.objectPositionY,
      scale: parsed.scale,
    };
  } catch {
    return null;
  }
}

export function serializeTransform(t: SlotTransform): string {
  return JSON.stringify({
    objectPositionX: t.objectPositionX,
    objectPositionY: t.objectPositionY,
    scale: t.scale,
  });
}

/** Returns the CSS the renderer needs:
 *  - objectPosition: applied to <img style="object-position: ...">
 *  - transform: applied to <img style="transform: ..."> for zoom
 *  - transformOrigin: matches object-position so zooming keeps the
 *    focal point fixed.
 */
export function cssForTransform(t: SlotTransform): {
  objectPosition: string;
  transform: string;
  transformOrigin: string;
} {
  const px = t.objectPositionX.toFixed(2);
  const py = t.objectPositionY.toFixed(2);
  const s = t.scale.toFixed(4);
  return {
    objectPosition: `${px}% ${py}%`,
    transform: `scale(${s})`,
    transformOrigin: `${px}% ${py}%`,
  };
}
