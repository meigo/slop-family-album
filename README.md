# slop-family-album

Local-first desktop app for building printed family photo albums and seasonal-memory wall calendars from a year of family photos.

## Status

**Phase 1 (Foundation) — complete.** Index folder → SQLite with thumbnails + EXIF, library grid.

**Phase 2a (CV pipeline) — complete.** Blur + face detection + perceptual hash; pHash duplicate groups.

**Phase 2b (Semantic CV) — complete.** OpenCLIP embeddings, scene tags, SFace face embeddings, exposure scoring.

**Phase 3a (Selection) — complete.** Aggregate scoring + album/calendar selection.

**Phase 3b (Layout + Review) — complete.** Auto-composed pages + popup picker.

**Phase 3c (Review power) — complete.** Per-page template dropdown, reorder, delete.

**Phase 3d (Slot transform + auto-position) — complete.** Drag-to-reposition + scroll/pinch zoom inside any slot, face-aware default crop (no AI needed — uses Phase 2a face data), insert blank pages anywhere in the album.

**Phase 3e (Sorter view) — complete.** Drag-reorder pages from a thumbnail-grid view.

**Phase 3f (In-place crop editor) — complete.** Slot edges show swap-photo and adjust-crop icons on hover; crop adjustments happen in-place over the slot (drag to reposition, scroll to zoom). Auto-position now uses `object-position` so slots always cover fully — no edge gaps. Empty slots show a checkerboard.

**Phase 4a (Calendar grid + events) — complete.** Calendar pages render an actual month grid (day headers + dates aligned to weekday, Mon/Sun toggle per project). Per-project events table with birthday/anniversary/event/holiday kinds, yearly-recurring or one-off. Inline events panel on the project page; one-click presets for Estonian + US holidays. Event marks show on the rendered grid color-coded by kind.

**Phase 4b (Text layers + Google Fonts) — complete.** Place text overlays anywhere on any page (album or calendar). Drag to reposition, drag the corner to resize, in-place edit content + style (font family, size, weight, italic, color, alignment). Curated catalog of ~20 Google Fonts loaded on-demand via a `<link>` tag.

Phase 4c (slot polish), Phase 4d (PDF export) — planned but not yet implemented.

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
