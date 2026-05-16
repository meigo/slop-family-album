# slop-family-album

Local-first desktop app for building printed family photo albums and seasonal-memory wall calendars from a year of family photos.

## Status

**Phase 1 (Foundation) — complete.** Index folder → SQLite with thumbnails + EXIF, library grid.

**Phase 2a (CV pipeline) — complete.** Blur + face detection + perceptual hash; pHash duplicate groups.

**Phase 2b (Semantic CV) — complete.** OpenCLIP embeddings, scene tags, SFace face embeddings, exposure scoring. Face clustering retained in code but de-emphasized in v1 UX (People page not surfaced in nav).

**Phase 3a (Selection) — complete.** Aggregate scoring + album/calendar selection algorithms (chronological, seasonal-memory). Year filter, per-month cap, adjacent-month fallback.

**Phase 3b (Layout + Review) — complete.** Layout templates + page assembly + visual review UI. Click any slot to swap via the popup picker (sortable by score, chronological, or visual similarity using CLIP embeddings; scope filter chips for bucket/nearby/all). Drop-in workflow: Generate → review → swap as needed → done.

Phase 4 (PDF export + LLM captions) is planned but not yet implemented.

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
