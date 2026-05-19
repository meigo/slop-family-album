# Annual Photo Album & Calendar Creator

Local-first desktop app that turns a folder of a year's photos into a printable
photo book and a matching wall calendar. Indexes your source folder, scores
each photo with on-device computer vision (blur, faces, scene tags, exposure),
auto-assembles pages you can review and tweak, and exports both as PDFs ready
for a print shop.

All photo data and analysis stays on your machine — nothing leaves the computer.

<video controls width="100%">
  <source src="https://github.com/meigo/slop-photo-album/raw/main/docs/media/puppets_demo.mp4" type="video/mp4">
</video>

## Features

**Library**

- Walks any source folder; extracts EXIF (dates, GPS, camera, lens) and writes a
  thumbnail for each photo into local SQLite.
- HEIC, JPEG, PNG, WebP. Cross-platform via libheif on macOS / built-in on Win.
- On-device CV pipeline: Laplacian blur (focused on face regions when present),
  YuNet face detection + SFace identity embeddings, OpenCLIP scene tagging,
  exposure scoring, pHash for duplicate detection.

**Album**

- Auto-selects the best photos per day (top-N by aggregate score) up to a
  per-month cap, then packs them into pages using a varied template rotation
  (hero, side-by-side, asymmetric trio, quad grid, six grid + mirrored
  variants) with a user-configurable max page count.
- Per-page template picker as a schematic-icon popover; reorder, regenerate,
  delete, swap two adjacent photos via mid-edge buttons, insert blank pages,
  adjust crop in-place with brightness / contrast / saturation sliders,
  face-aware default cropping.
- Drag-to-reorder sorter view shows every page as a thumbnail grid.
- Place text overlays anywhere on a page; ~20 curated Google Fonts.

**Calendar**

- 12 monthly pages, auto-populated from the year's photos with one representative
  photo per month (or several per page via the per-page template — side, pair,
  trio variants on top or bottom).
- Calendar grid with configurable rule style (boxed / spreadsheet-grid / lines /
  none), text + grid color, separate weekend (Sunday) color, Google Font for
  the grid, Mon/Sun week-start.
- Date numbers vertically centered under their column headers, scaled with
  page width so previews and exports render proportionally.

**Style + paper**

- Per-output paper size from a 14-preset catalog (A4/A4-portrait, US Letter,
  20/21/28/30 cm squares, 8/10/12" squares, 30×20cm + 28×21cm landscape,
  21×28cm + 20×28cm portrait). Album and calendar can have different sizes.
- Page bg color, slot gap, page margin, slot corner radius — separate values
  for album and calendar where it matters.
- Four built-in style presets (Minimal / Classic / Polaroid / Modern) that
  bundle gap / padding / corner / bg / calendar font / calendar color.

**Export**

- Per-output PDF export at a chosen target DPI (170 / 255 / 340). The scale
  multiplier is computed at capture time from the chosen DPI + paper size, so
  the label is honest regardless of preview thumbnail size.
- One PDF per output, written to a user-chosen path via the native save dialog.

## Tech stack

Tauri v2 shell · SvelteKit (Svelte 5) renderer · SQLite via `tauri-plugin-sql`
· Node sidecar (Sharp + exiftool-vendored) · Python sidecar (FastAPI + OpenCV

- OpenCLIP + imagehash) · jsPDF + modern-screenshot for PDF capture.

## Development

Requires Node ≥ 20, Rust toolchain (Tauri v2), Python ≥ 3.11, [uv](https://docs.astral.sh/uv/),
and `libheif` for HEIC support (`brew install libheif` on macOS; bundled in
the Windows distribution).

```bash
npm install
cd sidecar && npm install && cd ..
cd py-sidecar && uv sync && cd ..
npm run tauri dev
```

**First run note:** the first time the Python sidecar starts after `uv sync`,
OpenCLIP downloads the ViT-B/32 weights (~150 MB) to
`~/.cache/torch/hub/checkpoints/`. The first `/embed` or `/tags` call takes a
couple of minutes; subsequent runs are fast.

### Tests

```bash
cd sidecar && npm test            # Node sidecar (Vitest)
cd py-sidecar && uv run pytest    # Python sidecar
cd src-tauri && cargo test        # Rust
npx playwright test               # UI smoke (non-Tauri)
```

### Fixture generator

`tools/fixtures/` produces a synthetic family-of-four photo set via ComfyUI
(FLUX.1-dev) + ExifTool, for testing the index/CV/selection pipeline against
realistic-but-controllable data. See `tools/fixtures/README.md`.

## Architecture

See `docs/superpowers/specs/2026-05-14-family-album-builder-design.md` for the
original design doc. The app has grown beyond that spec — the source is now
the truth — but the high-level shape is unchanged: Tauri shell, SvelteKit UI,
SQLite for project + photo state, two sidecars (Node for fast EXIF/Sharp work,
Python for CV models that need PyTorch/OpenCV).

All photo data and ML inference is local. The Google Fonts CSS is the only
outbound request, and only when a non-default font is used.

## Not on the roadmap

**Per-photo LLM captions** were in the original design doc (local Ollama +
Gemma, with optional Claude opt-in) but won't ship. Photo albums rarely
benefit from labeling every photo, and the existing text-overlay feature
already covers the cases where a page genuinely wants text — album titles,
chapter or month headers, the occasional standout caption. A structured
caption field invites "fill every box" prose generation that produces
clichés the photos don't need; the date / GPS / scene tag / face name data
the LLM would draw from already lives on each photo record.

## Releases

No release pipeline yet — the app is dev-mode only (see the Phase 2+ note in
`src-tauri/src/sidecar.rs`). The two sidecars currently expect `node` on PATH
and a `py-sidecar/.venv` next to the binary, so a `tauri build` installer
would crash on launch.

A friends-and-family release pipeline is being designed — see
`docs/superpowers/specs/` once the design doc lands. Initial scope is Windows
x64, unsigned, no auto-update, distributed via GitHub Releases on `v*` tags.

## License

[MIT](LICENSE)
