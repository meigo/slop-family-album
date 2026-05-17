# Fixture generator

Generates synthetic family-album folders for testing the CV/EXIF/selection pipeline. Manifests are the ground truth; images are reproducible and never committed.

## Pipeline

```
generate-manifest → run-comfy → postprocess → write-exif
                                                  ↓
                              sample-albums/family-2025/IMG_*.jpg
```

Output is a single flat folder of JPEGs — same as what a phone import dumps. The app under test reads EXIF and organizes from there; pre-sorting into `YYYY/MM/` would defeat the test.

`build-album` also writes the raw ComfyUI PNGs to a *sibling* `<out>-raw/` folder (not inside `<out>/`) so pointing the app at `<out>/` won't pull in EXIF-less PNGs. The raw cache is kept so you can re-run postprocess (different JPEG quality, different mess effects) without re-rendering — re-rendering 80 photos is ~40 min, re-postprocessing is seconds.

## Prerequisites

- Node ≥ 20 (already required by the parent app).
- A running [ComfyUI](https://github.com/comfyanonymous/ComfyUI) instance reachable at `http://127.0.0.1:8000` (configurable via `--host`). The default matches the port slop-opera-factory uses on this workstation; vanilla ComfyUI launches on `8188`, so override `--host` if yours is on the upstream default.
- Model weights matching the shipped `workflow.json`, which targets **FLUX.1-dev (fp8)** — same weights slop-opera-factory uses:

  | File                                  | Goes in ComfyUI's              | Notes                          |
  | ------------------------------------- | ------------------------------ | ------------------------------ |
  | `flux1-dev-fp8.safetensors`           | `models/diffusion_models/`     | 12-step sampler                |
  | `clip_l.safetensors`                  | `models/clip/` or `text_encoders/` |                            |
  | `t5xxl_fp8_e4m3fn_scaled.safetensors` | `models/clip/` or `text_encoders/` | fp8 variant fits on 12 GB VRAM |
  | `ae.safetensors`                      | `models/vae/`                  | FLUX autoencoder               |

  Want FLUX-schnell (Apache-2.0, 4 steps) instead? Change node `"1"`'s `unet_name` to `flux1-schnell-fp8.safetensors` and drop node `"7"`'s `steps` from 12 to 4.

  Want SDXL or something else? Replace `workflow.json` with your own *Save (API Format)* export and update `workflow.overrides.json` to point at the right node IDs.

## Workflow + overrides

`workflow.json` is the raw API-format ComfyUI workflow — leave it untouched by hand-editing. `workflow.overrides.json` names which node IDs the runner overwrites per photo:

```json
{
  "prompt": "4",
  "seed": "7",
  "width": "6",
  "height": "6"
}
```

- `prompt` → node `"4"` (`CLIPTextEncode`, positive). Writes `inputs.text`.
- `seed` → node `"7"` (`KSampler`). Writes both `inputs.seed` and `inputs.noise_seed` so the same key works for KSampler and RandomNoise.
- `width` / `height` → node `"6"` (`EmptySD3LatentImage`). Same node ID; the runner writes the two fields independently.

`negative` is intentionally not wired: FLUX uses `ConditioningZeroOut` (node `"5"`) for the negative path and ignores text negatives. If you swap to SDXL, add a `CLIPTextEncode` for the negative branch in the workflow and wire `"negative"` → that node ID — the runner already understands the kind.

Any kind you omit is left untouched in the workflow.

## Commands

Run from `tools/fixtures/`:

```bash
# 1. Generate the manifest (deterministic, seeded)
npm run manifest -- --year 2025 --count 80 --seed 1 --name family-2025

# 2. Render via ComfyUI → raw PNGs (kept as a sibling, not inside the album folder)
npm run comfy -- --manifest manifests/family-2025.json --workflow workflow.json --overrides workflow.overrides.json --out ../../sample-albums/family-2025-raw

# 3. Sharp pass: JPEG re-encode + quality effects → flat folder of JPEGs
npm run postprocess -- --manifest manifests/family-2025.json --raw ../../sample-albums/family-2025-raw --out ../../sample-albums/family-2025

# 4. Write camera-style EXIF onto the JPEGs
npm run exif -- --manifest manifests/family-2025.json --album ../../sample-albums/family-2025

# Or run 2–4 in one go:
npm run build -- --manifest manifests/family-2025.json --out ../../sample-albums/family-2025
```

## Manifest schema

See `src/manifest.ts`. The manifest is the durable artifact — check it into `manifests/`. Anything else (raw PNGs, final JPEGs) is regenerable and gitignored.

## Adding events, cameras, locations

Edit `src/events.ts`. Event weights control how often each event appears; month/hour windows constrain when photos fall.

## Style variants

`--style realistic` (default) generates photo-realistic prompts.
`--style puppet` / `--style failure` are reserved for robustness/graceful-degradation sets — extend `src/events.ts` to add puppet-mode prompt variants when you need them.

## Quality flags

Per-photo `quality` tags in the manifest drive `postprocess.ts` and `write-exif.ts`:

| Tag              | Effect                                                       |
| ---------------- | ------------------------------------------------------------ |
| `good`           | No-op.                                                       |
| `blurry`         | Sharp gaussian blur.                                         |
| `dark`           | Linear darken.                                               |
| `overexposed`    | Linear brighten.                                             |
| `no_exif`        | EXIF stripped after JPEG write.                              |
| `screenshot`     | EXIF stripped (same as `no_exif`).                           |
| `wrong_date`     | EXIF date shifted by −1 year.                                |
| `duplicate`      | Use sibling `duplicateOf` entry as the source PNG.           |
| `near_duplicate` | Same source PNG, postprocess applies slight variation.       |

These are intentionally minimal; extend `postprocess.ts` when a real failure case in the app warrants it.
