# Fixture generator

Generates synthetic family-album folders for testing the CV/EXIF/selection pipeline. Manifests are the ground truth; images are reproducible and never committed.

## Pipeline

```
generate-manifest → run-comfy → postprocess → write-exif
                                                  ↓
                              sample-albums/family-2025/2025/MM/IMG_*.jpg
```

## Prerequisites

- Node ≥ 20 (already required by the parent app).
- A running [ComfyUI](https://github.com/comfyanonymous/ComfyUI) instance reachable at `http://127.0.0.1:8188` (configurable).
- A ComfyUI workflow exported via *Save (API Format)* as `tools/fixtures/workflow.json` — leave it exactly as ComfyUI emits it. No editing required.
- A sibling `tools/fixtures/workflow.overrides.json` that names which node IDs the runner should write per photo. Example:

  ```json
  {
    "prompt": "6",
    "negative": "7",
    "seed": "31",
    "width": "5",
    "height": "5"
  }
  ```

  Node IDs are the string keys in the API-format workflow JSON. Open `workflow.json`, find the relevant nodes (CLIPTextEncode for prompts, KSampler/RandomNoise for seed, EmptyLatentImage / EmptySD3LatentImage for dimensions), and copy their IDs.

  Any kind you omit is left untouched in the workflow — e.g. drop `negative` and the workflow's hardcoded negative prompt is used as-is. For `seed`, both `inputs.seed` and `inputs.noise_seed` are set so the override works on KSampler and RandomNoise samplers without ceremony.

## Commands

Run from `tools/fixtures/`:

```bash
# 1. Generate the manifest (deterministic, seeded)
npm run manifest -- --year 2025 --count 300 --seed 1 --name family-2025

# 2. Render via ComfyUI → raw PNGs
npm run comfy -- --manifest manifests/family-2025.json --workflow workflow.json --overrides workflow.overrides.json --out ../../sample-albums/family-2025/raw

# 3. Sharp pass: JPEG re-encode + quality effects → final folder structure
npm run postprocess -- --manifest manifests/family-2025.json --raw ../../sample-albums/family-2025/raw --out ../../sample-albums/family-2025

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
