# slop-family-album

Local-first desktop app for building printed family photo albums and seasonal-memory wall calendars from a year of family photos.

## Status

**Phase 1 (Foundation) — complete.** App indexes a folder into SQLite with thumbnails + EXIF and shows the library as a grid.

**Phase 2a (CV pipeline) — complete.** Python sidecar runs blur + face detection + perceptual hash on every indexed photo. Duplicate groups are detected via pHash Hamming distance.

**Phase 2b (Semantic CV) — complete.** Image embeddings (OpenCLIP), zero-shot scene tags, SFace face embeddings, face clustering, exposure scoring. People page lets you name face clusters and pin "must-include" ones.

**Phase 3a (Selection) — complete.** Aggregate scoring + chronological album selection + seasonal-memory calendar selection. Dashboard has Generate buttons; selection view at `/projects/[id]/selection/[kind]` shows the ordered list bucket-by-bucket with thumbnails, rank, and score.

Phase 3b (page layout + review UI) and Phase 4 (PDF export + LLM captions) are planned but not yet implemented.

See `docs/superpowers/specs/2026-05-14-family-album-builder-design.md` for the design.

## Development

Requires: Node ≥ 20, Rust toolchain (for Tauri v2), Python ≥ 3.11, `uv` (https://docs.astral.sh/uv/), `libheif` if you want HEIC support (`brew install libheif` on macOS).

```bash
npm install
cd sidecar && npm install && cd ..
cd py-sidecar && uv sync && cd ..
npm run tauri dev
```

**First run note:** The first time Tauri spawns the Python sidecar after `uv sync`, OpenCLIP downloads the ViT-B/32 weights (~150 MB) to `~/.cache/torch/hub/checkpoints/`. Allow a couple of minutes for the first `/embed` or `/tags` call to complete; subsequent runs are fast.

Run sidecar tests:

```bash
cd sidecar && npm test
```

Run Python sidecar tests:

```bash
cd py-sidecar && uv run pytest
```

Run Rust tests:

```bash
cd src-tauri && cargo test
```

UI smoke (non-Tauri):

```bash
npx playwright test
```

## Architecture

See `docs/superpowers/specs/2026-05-14-family-album-builder-design.md`.

Short version: Tauri v2 shell + SvelteKit renderer + SQLite + Node sidecar (Sharp + ExifTool) + Python sidecar (OpenCV + imagehash). All data stays local.
