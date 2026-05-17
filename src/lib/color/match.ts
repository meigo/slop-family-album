import { convertFileSrc } from '@tauri-apps/api/core';
import { analyzeImageColor } from './analyze';
import {
  parseTransform,
  serializeTransform,
  IDENTITY_TRANSFORM,
  type SlotTransform,
} from '$lib/layout/transform';
import { autoPositionTransform } from '$lib/layout/autoposition';
import { getTemplate } from '$lib/layout/templates';
import { updateSlotTransform } from '$lib/db';

interface SlotForMatch {
  page_id: number;
  slot_index: number;
  photo_id: number | null;
  path: string | null;
  thumb_path: string | null;
  transform_json: string | null;
  photo_width: number | null;
  photo_height: number | null;
  faces: Array<{ bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }>;
  top_tag: string | null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Compute the transform we'd render today for a slot with no manual
 *  transform yet, mirroring PageView's effectiveTransform logic. */
function autoTransformFor(slot: SlotForMatch, templateId: string): SlotTransform {
  const parsed = parseTransform(slot.transform_json);
  if (parsed) return parsed;
  const tpl = getTemplate(templateId);
  const layout = tpl.slots[slot.slot_index];
  if (slot.photo_width !== null && slot.photo_height !== null && layout) {
    return autoPositionTransform({
      photoWidth: slot.photo_width,
      photoHeight: slot.photo_height,
      faces: slot.faces,
      topTag: slot.top_tag,
      slot: layout,
    });
  }
  return { ...IDENTITY_TRANSFORM };
}

/**
 * Use one slot's photo as the color reference and pull every other
 * filled slot on the page toward it. The reference itself gets its
 * warmth + brightness reset to identity (0, 1) — it's the truth, not
 * something to be adjusted.
 *
 * Returns the number of non-reference slots adjusted.
 */
export async function autoBalancePageColors(args: {
  pageId: number;
  templateId: string;
  slots: SlotForMatch[];
  referenceSlotIndex: number;
}): Promise<number> {
  const valid = args.slots.filter((s) => s.path !== null && s.photo_id !== null);
  if (valid.length < 1) return 0;

  const refIndex = valid.findIndex((s) => s.slot_index === args.referenceSlotIndex);
  if (refIndex < 0) return 0;

  // Analyze every slot via its cached thumbnail.
  const stats = await Promise.all(
    valid.map(async (s) => {
      const src = convertFileSrc(s.thumb_path ?? s.path!);
      try {
        return await analyzeImageColor(src);
      } catch {
        return { r: 128, g: 128, b: 128, chroma: 0 };
      }
    })
  );

  const target = stats[refIndex];
  const targetLum = 0.299 * target.r + 0.587 * target.g + 0.114 * target.b;
  const targetRB = target.r - target.b;

  let adjusted = 0;
  for (let i = 0; i < valid.length; i++) {
    const slot = valid[i];
    const base = autoTransformFor(slot, args.templateId);

    let warmth: number;
    let brightness: number;
    let saturation: number;
    if (i === refIndex) {
      // Reference: reset its color adjustments to identity.
      warmth = 0;
      brightness = 1;
      saturation = 1;
    } else {
      const cur = stats[i];
      const curLum = 0.299 * cur.r + 0.587 * cur.g + 0.114 * cur.b;
      const curRB = cur.r - cur.b;
      // The SVG color matrix applies ~k*(R+B) shift per unit of warmth
      // (k=0.25). For a typical mid-tone (R+B ≈ 250), one unit shifts
      // (R-B) by ~62. So divide the delta by 62 to land at the target.
      warmth = clamp((targetRB - curRB) / 62, -1, 1);
      brightness = clamp(targetLum / Math.max(curLum, 1), 0.7, 1.4);
      // Saturation: match average chroma. Photos with a dull tone get a
      // multiplier > 1; an over-saturated one gets < 1.
      saturation = clamp(target.chroma / Math.max(cur.chroma, 1), 0.6, 1.8);
      adjusted++;
    }

    const updated: SlotTransform = { ...base, warmth, brightness, saturation };
    await updateSlotTransform(args.pageId, slot.slot_index, serializeTransform(updated));
  }

  return adjusted;
}
