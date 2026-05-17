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
 * Analyze every filled slot on a page, compute the page-wide average
 * RGB, and derive per-slot warmth + brightness corrections that pull
 * each photo's mean color toward that average. Persists the updated
 * transforms via updateSlotTransform.
 *
 * Returns the number of slots adjusted.
 */
export async function autoBalancePageColors(args: {
  pageId: number;
  templateId: string;
  slots: SlotForMatch[];
}): Promise<number> {
  const valid = args.slots.filter((s) => s.path !== null && s.photo_id !== null);
  if (valid.length < 2) return 0;

  // Analyze. Use the cached thumbnail when available (much faster).
  const means = await Promise.all(
    valid.map(async (s) => {
      const src = convertFileSrc(s.thumb_path ?? s.path!);
      try {
        return await analyzeImageColor(src);
      } catch {
        return { r: 128, g: 128, b: 128 };
      }
    })
  );

  // Target = mean of means.
  const n = means.length;
  const target = {
    r: means.reduce((a, m) => a + m.r, 0) / n,
    g: means.reduce((a, m) => a + m.g, 0) / n,
    b: means.reduce((a, m) => a + m.b, 0) / n,
  };
  const targetLum = 0.299 * target.r + 0.587 * target.g + 0.114 * target.b;
  const targetRB = target.r - target.b;

  // Apply per-slot corrections.
  for (let i = 0; i < valid.length; i++) {
    const cur = means[i];
    const curLum = 0.299 * cur.r + 0.587 * cur.g + 0.114 * cur.b;
    const curRB = cur.r - cur.b;

    // Warmth: bring (R-B) toward target. The SVG matrix uses
    // k = 0.25 strength; one unit of warmth shifts (R-B) by ~k*(R+B).
    // Empirically a linear factor of (targetRB-curRB)/80 maps well to
    // the slider's -1..1 range without overshoot.
    const warmth = clamp((targetRB - curRB) / 80, -1, 1);

    // Brightness: linear scale to match luminance.
    const brightness = clamp(targetLum / Math.max(curLum, 1), 0.7, 1.4);

    const base = autoTransformFor(valid[i], args.templateId);
    const updated: SlotTransform = { ...base, warmth, brightness };
    await updateSlotTransform(args.pageId, valid[i].slot_index, serializeTransform(updated));
  }

  return valid.length;
}
