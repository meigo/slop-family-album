import type { SlotLayout } from './templates';
import { IDENTITY_TRANSFORM, type SlotTransform } from './transform';

/**
 * Compute a default crop transform for a photo placed in a slot.
 *
 * Inputs:
 *   - photoWidth/photoHeight: natural pixel dimensions of the photo
 *   - faces: detected face bounding boxes in photo pixel coordinates
 *     (from `face` table; may be empty)
 *   - topTag: top scene tag from `photo_tag` table (or null)
 *   - slot: slot's normalized layout (x, y, w, h in 0-1 of page)
 *
 * Output: a SlotTransform that, applied to the photo-in-slot, makes the
 * subject visible. The slot already uses `object-fit: cover`, which scales
 * the photo to fill the slot's aspect ratio (cropping the longer dimension).
 * This function then translates the photo so the subject stays in frame.
 *
 * Rule order:
 *   1. If faces exist: compute bounding box around all faces; translate so
 *      that bbox's center sits at the slot's center.
 *   2. Else if topTag suggests a horizon-biased scene (landscape, beach,
 *      forest, snow, city, outdoor): shift down ~15% so the horizon sits
 *      at the upper third (rule-of-thirds).
 *   3. Else: identity (object-fit: cover center crop).
 *
 * This is deterministic and inexpensive (no model inference). It produces
 * the default; if the user manually adjusts via SlotEditor, that override
 * is stored in `page_slot.transform_json` and beats this function.
 */
export function autoPositionTransform(args: {
  photoWidth: number;
  photoHeight: number;
  faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
  topTag: string | null;
  slot: SlotLayout;
}): SlotTransform {
  const { photoWidth, photoHeight, faces, topTag, slot } = args;

  const slotAspect = slot.w / slot.h;
  const photoAspect = photoWidth / photoHeight;

  // After object-fit: cover, the photo is scaled so the slot is fully covered.
  // We compute how much of the photo (in its own [0..1] space) is visible
  // along each axis after that cover-fit, then translate the photo so the
  // subject lands at the slot's center.

  // --- Pass 1: faces ---
  if (faces.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of faces) {
      minX = Math.min(minX, f.bbox_x);
      minY = Math.min(minY, f.bbox_y);
      maxX = Math.max(maxX, f.bbox_x + f.bbox_w);
      maxY = Math.max(maxY, f.bbox_y + f.bbox_h);
    }
    const cx = ((minX + maxX) / 2) / photoWidth;   // 0..1
    const cy = ((minY + maxY) / 2) / photoHeight;  // 0..1

    let visibleFractionX: number;
    let visibleFractionY: number;
    if (photoAspect > slotAspect) {
      visibleFractionY = 1;
      visibleFractionX = slotAspect / photoAspect;
    } else {
      visibleFractionX = 1;
      visibleFractionY = photoAspect / slotAspect;
    }

    const offsetX = ((0.5 - cx) / visibleFractionX);
    const offsetY = ((0.5 - cy) / visibleFractionY);

    const maxOffsetX = (1 - visibleFractionX) / (2 * visibleFractionX);
    const maxOffsetY = (1 - visibleFractionY) / (2 * visibleFractionY);
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));

    return { offsetX: clampedX, offsetY: clampedY, scale: 1 };
  }

  // --- Pass 2: horizon-biased tags ---
  if (topTag) {
    const horizonTags = new Set(['landscape', 'beach', 'forest', 'snow', 'city', 'outdoor']);
    if (horizonTags.has(topTag)) {
      let visibleFractionY = 1;
      if (photoAspect <= slotAspect) {
        visibleFractionY = photoAspect / slotAspect;
      }
      const desiredOffsetY = -0.17 / visibleFractionY;
      const maxOffsetY = (1 - visibleFractionY) / (2 * visibleFractionY);
      const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, desiredOffsetY));
      return { offsetX: 0, offsetY: clampedY, scale: 1 };
    }
  }

  // --- Pass 3: identity ---
  return { ...IDENTITY_TRANSFORM };
}
