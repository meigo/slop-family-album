# Family Album & Calendar Builder — Phase 2a (CV Pipeline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the cheapest, highest-impact computer-vision scoring to each indexed photo: **blur** (Laplacian variance), **face count + boxes** (OpenCV Haar cascade), and **perceptual hash** (imagehash). Use those to build **duplicate groups**. The library grid surfaces blur and face indicators per thumbnail. No embeddings, no scene tags, no face clustering — those are Phase 2b.

**Architecture:** Add a second sidecar in Python (FastAPI on a random localhost port, spawned by Tauri the same way Node is). Use the Python sidecar for CV work that the Node ecosystem doesn't do well (OpenCV is the canonical home of Laplacian variance + cascaded face detectors + imagehash). The renderer's indexing orchestrator calls the Python sidecar after the existing Node sidecar steps. New SQLite columns/tables hold the CV results; the dedup pass runs after indexing using pHash Hamming distance.

**Tech Stack:** Python ≥3.11, `uv` (modern Python package manager), FastAPI, uvicorn, `opencv-python` (blur + face detection), `Pillow`, `imagehash` (perceptual hash). Tauri/Rust spawns the Python sidecar via `python -m server` from a uv-managed venv. Pytest for sidecar tests.

**Spec reference:** `slop-ideas/docs/superpowers/specs/2026-05-14-family-album-builder-design.md`

**Working directory:** All tasks run from `/Users/meigo/Projects/slop/slop-family-album/`.

**Phase 2a NOT in scope** (deferred to Phase 2b):
- Image embeddings (OpenCLIP)
- Scene tags (zero-shot classification)
- Face clustering into named persons (`person_cluster` table stays empty)
- Exposure / composition scoring
- The full `score` aggregate table — Phase 2a stores raw CV outputs directly; aggregate scoring lands in Phase 3 (selection).

---

## File Structure (Phase 2a additions)

```
slop-family-album/
  py-sidecar/                          # NEW — Python sidecar root
    pyproject.toml
    uv.lock
    src/
      server/
        __init__.py
        __main__.py                    # uvicorn entry, prints SIDECAR_READY <port>
        app.py                         # FastAPI app builder
        blur.py                        # Laplacian variance
        faces.py                       # Haar cascade face detection
        phash.py                       # imagehash wrapper
    tests/
      test_app.py
      test_blur.py
      test_faces.py
      test_phash.py
    fixtures/
      sharp.jpg                        # high-contrast image
      blurry.jpg                       # gaussian-blurred copy of sharp
      face.jpg                         # single visible face (synthetic or fixture)
      copy1.jpg / copy2.jpg            # near-duplicates for phash
  src-tauri/
    migrations/
      002_cv_pipeline.sql              # NEW
    src/
      lib.rs                           # register migration 002
      py_sidecar.rs                    # NEW — analogous to sidecar.rs (Node)
  src/lib/
    sidecar/
      py-client.ts                     # NEW — TS wrapper for Python sidecar HTTP
    db/
      index.ts                         # add CV-row helpers
      types.ts                         # add CvScoreRow, DuplicateGroupRow
    indexing/
      scanner.ts                       # extend to call CV sidecar + dedup pass
      dedup.ts                         # NEW — pHash Hamming → groups
  src/routes/projects/[id]/library/
    +page.svelte                       # show blur + faces badge + dup-group bracket
```

---

## Phase 2A.1 — Schema

### Task 1: Migration 002_cv_pipeline.sql

- [ ] **Step 1: Create `src-tauri/migrations/002_cv_pipeline.sql`**

```sql
-- Per-photo computer-vision outputs. Phase 2a stores blur, face count,
-- and perceptual hash. Phase 2b will extend with embeddings + tags;
-- those go in separate tables, not new columns here.
CREATE TABLE cv_score (
  photo_id INTEGER PRIMARY KEY REFERENCES photo(id) ON DELETE CASCADE,
  blur REAL,             -- Laplacian variance, normalized by image area (higher = sharper)
  faces_count INTEGER,   -- Haar cascade detection count
  faces_json TEXT,       -- bounding boxes as JSON array: [{x,y,w,h}, ...]
  phash TEXT,            -- 64-bit perceptual hash, hex-encoded
  computed_at INTEGER NOT NULL
);

CREATE INDEX idx_cv_score_phash ON cv_score (phash);

-- Duplicate groups. The representative is the highest-blur (sharpest)
-- member; others are demoted in selection scoring (Phase 3).
CREATE TABLE duplicate_group (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  representative_photo_id INTEGER NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE duplicate_group_member (
  group_id INTEGER NOT NULL REFERENCES duplicate_group(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, photo_id)
);

CREATE INDEX idx_dup_member_photo ON duplicate_group_member (photo_id);
```

- [ ] **Step 2: Register migration 002 in `src-tauri/src/lib.rs`**

Find the existing `migrations()` fn and append a second `Migration` entry:

```rust
fn migrations() -> Vec<tauri_plugin_sql::Migration> {
  vec![
    tauri_plugin_sql::Migration {
      version: 1,
      description: "initial_phase_1_schema",
      sql: include_str!("../migrations/001_initial.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
      version: 2,
      description: "cv_pipeline_blur_faces_phash_dups",
      sql: include_str!("../migrations/002_cv_pipeline.sql"),
      kind: tauri_plugin_sql::MigrationKind::Up,
    },
  ]
}
```

- [ ] **Step 3: Verify build**

```bash
cd src-tauri && cargo check && cd ..
npm run build
```

Both must succeed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Migration 002: cv_score + duplicate_group tables"
```

### Task 2: DB module additions

- [ ] **Step 1: Extend `src/lib/db/types.ts`**

Append:

```ts
export interface CvScoreRow {
  photo_id: number;
  blur: number | null;
  faces_count: number | null;
  faces_json: string | null;
  phash: string | null;
  computed_at: number;
}

export interface CvScoreInsert {
  photo_id: number;
  blur: number | null;
  faces_count: number | null;
  faces_json: string | null;
  phash: string | null;
  computed_at: number;
}

export interface DuplicateGroupRow {
  id: number;
  project_id: number;
  representative_photo_id: number;
  created_at: number;
}
```

- [ ] **Step 2: Extend `src/lib/db/index.ts`**

Append:

```ts
import type { CvScoreRow, CvScoreInsert, DuplicateGroupRow } from './types';

export async function upsertCvScore(s: CvScoreInsert): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO cv_score (photo_id, blur, faces_count, faces_json, phash, computed_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (photo_id) DO UPDATE SET
       blur = excluded.blur,
       faces_count = excluded.faces_count,
       faces_json = excluded.faces_json,
       phash = excluded.phash,
       computed_at = excluded.computed_at`,
    [s.photo_id, s.blur, s.faces_count, s.faces_json, s.phash, s.computed_at]
  );
}

export async function getCvScore(photoId: number): Promise<CvScoreRow | null> {
  const d = await db();
  const rows = await d.select<CvScoreRow[]>(
    'SELECT * FROM cv_score WHERE photo_id = ?', [photoId]
  );
  return rows[0] ?? null;
}

export async function listCvScoresByProject(projectId: number): Promise<Array<CvScoreRow & { path: string }>> {
  const d = await db();
  return d.select<Array<CvScoreRow & { path: string }>>(
    `SELECT cv_score.*, photo.path
     FROM cv_score
     INNER JOIN photo ON photo.id = cv_score.photo_id
     WHERE photo.project_id = ?`,
    [projectId]
  );
}

// Used by the scanner to skip CV work on photos already CV-scored after
// they were last indexed.
export async function listCvComputedAtByPhotoId(projectId: number): Promise<Map<number, number>> {
  const d = await db();
  const rows = await d.select<{ photo_id: number; computed_at: number }[]>(
    `SELECT cv_score.photo_id, cv_score.computed_at
     FROM cv_score
     INNER JOIN photo ON photo.id = cv_score.photo_id
     WHERE photo.project_id = ?`,
    [projectId]
  );
  return new Map(rows.map((r) => [r.photo_id, r.computed_at]));
}

export async function clearDuplicateGroups(projectId: number): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM duplicate_group WHERE project_id = ?', [projectId]);
}

export async function insertDuplicateGroup(args: {
  project_id: number;
  representative_photo_id: number;
  member_photo_ids: number[];
}): Promise<number> {
  const d = await db();
  const now = Date.now();
  const res = await d.execute(
    'INSERT INTO duplicate_group (project_id, representative_photo_id, created_at) VALUES (?, ?, ?)',
    [args.project_id, args.representative_photo_id, now]
  );
  const gid = res.lastInsertId as number;
  for (const pid of args.member_photo_ids) {
    await d.execute(
      'INSERT INTO duplicate_group_member (group_id, photo_id) VALUES (?, ?)',
      [gid, pid]
    );
  }
  return gid;
}

export async function listDuplicateMembersByPhoto(projectId: number): Promise<Map<number, number>> {
  // photo_id → group_id (which dup group, if any, each photo belongs to)
  const d = await db();
  const rows = await d.select<{ photo_id: number; group_id: number }[]>(
    `SELECT duplicate_group_member.photo_id, duplicate_group_member.group_id
     FROM duplicate_group_member
     INNER JOIN duplicate_group ON duplicate_group.id = duplicate_group_member.group_id
     WHERE duplicate_group.project_id = ?`,
    [projectId]
  );
  return new Map(rows.map((r) => [r.photo_id, r.group_id]));
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "DB module: cv_score + duplicate_group helpers"
```

---

## Phase 2A.2 — Python Sidecar

### Task 3: Bootstrap Python sidecar with uv

- [ ] **Step 1: Verify `uv` is installed**

```bash
which uv || echo "Install via: curl -LsSf https://astral.sh/uv/install.sh | sh   (macOS/Linux)"
```

If missing, instruct the user to install. Do not proceed without uv.

- [ ] **Step 2: Initialize the package**

```bash
mkdir -p py-sidecar/src/server py-sidecar/tests py-sidecar/fixtures
cd py-sidecar
uv init --python 3.11 --package
```

This produces a `pyproject.toml` + `src/py_sidecar/__init__.py` skeleton. Move the source into the layout we want:

```bash
rm -rf src/py_sidecar
```

Replace `pyproject.toml` content with:

```toml
[project]
name = "slop-family-album-py-sidecar"
version = "0.1.0"
description = "Python CV sidecar for Family Album & Calendar Builder"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.110",
  "uvicorn[standard]>=0.30",
  "opencv-python-headless>=4.9",
  "pillow>=10.0",
  "imagehash>=4.3",
]

[dependency-groups]
dev = [
  "pytest>=8.0",
  "httpx>=0.27",
]

[tool.uv]
package = true

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/server"]
```

(Note: `opencv-python-headless` over `opencv-python` — no GUI deps, smaller install, works in headless contexts like Tauri-spawned processes.)

- [ ] **Step 3: Install dependencies**

```bash
uv sync
```

This creates `.venv/` inside `py-sidecar/`. uv resolves and installs; first run downloads opencv wheels (~70 MB).

- [ ] **Step 4: Write minimal `src/server/__init__.py`**

```python
# Marker file. Real code lives in app.py / __main__.py.
```

- [ ] **Step 5: Write `src/server/app.py`**

```python
"""FastAPI app builder. Routes registered here so tests can import buildServer-equivalent via app fixture."""
from fastapi import FastAPI


def build_app() -> FastAPI:
    app = FastAPI(title="slop-family-album-py-sidecar")

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    return app
```

- [ ] **Step 6: Write `src/server/__main__.py`**

```python
"""Entry point. Run as `python -m server` from py-sidecar/ with venv active."""
import socket
import sys

import uvicorn

from server.app import build_app


def _free_port() -> int:
    """Bind to port 0 to let the OS pick, then close and re-use that port.

    There's a TOCTOU race here (something else could grab the port between
    our close and uvicorn's bind), but the renderer reaches us via this
    process's stdout-announced port, not by guessing, so a re-rolled port
    on the rare race only delays our first announcement.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    app = build_app()
    port = _free_port()
    # Print SIDECAR_READY *before* uvicorn.run blocks. Tauri parses this
    # line from our stdout to discover the port. Newline-flushed so the
    # async readline in Rust sees it immediately.
    print(f"SIDECAR_READY {port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Smoke-run manually**

```bash
uv run python -m server &
PID=$!
sleep 3
kill $PID 2>/dev/null
wait $PID 2>/dev/null
```

Expected: stdout shows `SIDECAR_READY <port>`. Then the process exits cleanly.

- [ ] **Step 8: Write `tests/test_app.py`**

```python
from fastapi.testclient import TestClient

from server.app import build_app


def test_health() -> None:
    app = build_app()
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
```

- [ ] **Step 9: Run tests**

```bash
cd py-sidecar && uv run pytest -q
```

Expected: 1 passed.

- [ ] **Step 10: `.gitignore` for py-sidecar**

Append to repo root `.gitignore`:

```
py-sidecar/.venv/
py-sidecar/.pytest_cache/
py-sidecar/__pycache__/
py-sidecar/src/**/__pycache__/
py-sidecar/tests/**/__pycache__/
```

- [ ] **Step 11: Commit**

```bash
cd ..
git add -A
git commit -m "Python sidecar scaffold: uv + FastAPI + /health"
```

### Task 4: Blur endpoint + fixtures

- [ ] **Step 1: Create fixture images**

Write `py-sidecar/scripts/make_fixtures.py` (similar to the Node sidecar's `make-fixtures.ts`):

```python
"""Regenerate CV-test fixtures from scratch.

- sharp.jpg: 1024×768 high-contrast checkerboard (high Laplacian variance)
- blurry.jpg: same image with heavy gaussian blur
- face.jpg: a synthetic frontal face-like pattern (two dark circles for
  eyes, dark arc for mouth, on a light oval). The Haar cascade is not
  perfect on synthetic input, but it should detect this. If detection
  rate is unreliable, the test asserts `>=0` faces_count instead of
  exact count — we test that the endpoint runs without error and
  returns plausible shape, not detector accuracy.
- copy1.jpg / copy2.jpg: same source, JPEG-recompressed at q=70 and q=40
  to create near-duplicates with different bytes but identical pHash.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


HERE = Path(__file__).parent
FIX = HERE.parent / "fixtures"
FIX.mkdir(exist_ok=True)


def write_sharp() -> Path:
    # 1024x768 checkerboard, 32px squares — high frequency content.
    img = np.zeros((768, 1024, 3), dtype=np.uint8)
    for y in range(0, 768, 32):
        for x in range(0, 1024, 32):
            if ((x // 32) + (y // 32)) % 2 == 0:
                img[y:y + 32, x:x + 32] = (240, 240, 240)
    cv2.imwrite(str(FIX / "sharp.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return FIX / "sharp.jpg"


def write_blurry(sharp_path: Path) -> Path:
    img = cv2.imread(str(sharp_path))
    blurred = cv2.GaussianBlur(img, (51, 51), sigmaX=20)
    cv2.imwrite(str(FIX / "blurry.jpg"), blurred, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return FIX / "blurry.jpg"


def write_face() -> Path:
    # Synthetic face-ish pattern. Real face fixtures should be added later
    # if detection accuracy needs validating; for v2a we test that the
    # endpoint runs and returns a list of boxes (possibly empty).
    img = Image.new("RGB", (512, 512), (220, 200, 180))  # skin tone-ish
    d = ImageDraw.Draw(img)
    # Eyes
    d.ellipse((160, 180, 220, 220), fill=(40, 40, 40))
    d.ellipse((290, 180, 350, 220), fill=(40, 40, 40))
    # Mouth
    d.arc((180, 280, 330, 380), start=0, end=180, fill=(80, 40, 40), width=4)
    # Face outline
    d.ellipse((120, 100, 390, 470), outline=(100, 80, 60), width=3)
    img.save(FIX / "face.jpg", "JPEG", quality=90)
    return FIX / "face.jpg"


def write_copies(sharp_path: Path) -> None:
    img = Image.open(sharp_path)
    img.save(FIX / "copy1.jpg", "JPEG", quality=70)
    img.save(FIX / "copy2.jpg", "JPEG", quality=40)


def main() -> None:
    s = write_sharp()
    write_blurry(s)
    write_face()
    write_copies(s)
    print(f"Wrote fixtures to {FIX}")


if __name__ == "__main__":
    main()
```

Run it:

```bash
cd py-sidecar && uv run python scripts/make_fixtures.py
```

Verify the files exist:

```bash
ls fixtures/
```

Should show: `blurry.jpg copy1.jpg copy2.jpg face.jpg sharp.jpg`.

- [ ] **Step 2: Write the failing test `tests/test_blur.py`**

```python
from pathlib import Path

from server.blur import laplacian_variance


FIX = Path(__file__).parent.parent / "fixtures"


def test_sharp_has_higher_blur_score_than_blurry() -> None:
    sharp = laplacian_variance(str(FIX / "sharp.jpg"))
    blurry = laplacian_variance(str(FIX / "blurry.jpg"))
    # Both should be positive numbers; sharp must be at least 5x higher.
    assert sharp > 0
    assert blurry > 0
    assert sharp > blurry * 5


def test_missing_file_raises() -> None:
    import pytest

    with pytest.raises(FileNotFoundError):
        laplacian_variance("/nonexistent/file.jpg")
```

Run — should FAIL (no blur module yet).

- [ ] **Step 3: Write `src/server/blur.py`**

```python
"""Blur scoring via Laplacian variance.

Laplacian variance is a classical sharpness measure: convolve with a
Laplacian kernel (second derivative) and take variance. Sharp edges
contribute large positive and negative responses; blur smooths the
response, lowering variance.

We normalize by image area so the score is comparable across resolutions.
"""
import os

import cv2


def laplacian_variance(path: str) -> float:
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        # imread returns None on decode failure (e.g. corrupt JPEG)
        raise ValueError(f"could not decode image: {path}")
    lap = cv2.Laplacian(img, cv2.CV_64F)
    var = float(lap.var())
    # Normalize per million pixels so scores compare across sizes.
    h, w = img.shape[:2]
    mpx = (h * w) / 1_000_000.0
    return var / max(mpx, 0.01)
```

Run tests — should pass.

- [ ] **Step 4: Wire `/blur` route in `app.py`**

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server.blur import laplacian_variance


class BlurRequest(BaseModel):
    path: str


def build_app() -> FastAPI:
    app = FastAPI(title="slop-family-album-py-sidecar")

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/blur")
    async def blur(req: BlurRequest) -> dict[str, float]:
        try:
            return {"blur": laplacian_variance(req.path)}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    return app
```

- [ ] **Step 5: Extend `tests/test_app.py`**

Append:

```python
from pathlib import Path

FIX = Path(__file__).parent.parent / "fixtures"


def test_blur_endpoint_returns_score() -> None:
    app = build_app()
    client = TestClient(app)
    r = client.post("/blur", json={"path": str(FIX / "sharp.jpg")})
    assert r.status_code == 200
    assert r.json()["blur"] > 0


def test_blur_endpoint_404_on_missing() -> None:
    app = build_app()
    client = TestClient(app)
    r = client.post("/blur", json={"path": "/nonexistent/file.jpg"})
    assert r.status_code == 404
```

- [ ] **Step 6: Run all tests**

```bash
uv run pytest -q
```

Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Python sidecar /blur endpoint + fixtures"
```

### Task 5: pHash endpoint

- [ ] **Step 1: Write failing test `tests/test_phash.py`**

```python
from pathlib import Path

from server.phash import perceptual_hash


FIX = Path(__file__).parent.parent / "fixtures"


def test_phash_returns_16_hex_chars() -> None:
    h = perceptual_hash(str(FIX / "sharp.jpg"))
    assert len(h) == 16
    assert all(c in "0123456789abcdef" for c in h)


def test_near_duplicates_share_phash() -> None:
    # Same source image at different JPEG qualities → same perceptual hash.
    h1 = perceptual_hash(str(FIX / "copy1.jpg"))
    h2 = perceptual_hash(str(FIX / "copy2.jpg"))
    assert h1 == h2
```

Run — should FAIL.

- [ ] **Step 2: Write `src/server/phash.py`**

```python
"""Perceptual hash for near-duplicate detection.

`imagehash.phash` produces a 64-bit DCT-based hash that's stable under
small edits (recompression, mild crop, slight color shift). We
hex-encode the 64-bit hash so the renderer can compare via Hamming
distance on hex strings.
"""
import imagehash
from PIL import Image


def perceptual_hash(path: str) -> str:
    with Image.open(path) as img:
        h = imagehash.phash(img, hash_size=8)  # 8 → 64-bit
    # imagehash's str() returns 16 hex chars for an 8×8 hash.
    return str(h)
```

Tests pass.

- [ ] **Step 3: Add `/phash` route to `app.py`**

```python
from server.phash import perceptual_hash

# inside build_app:
    class PhashRequest(BaseModel):
        path: str

    @app.post("/phash")
    async def phash(req: PhashRequest) -> dict[str, str]:
        try:
            return {"phash": perceptual_hash(req.path)}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
```

Note: Pillow raises `FileNotFoundError` on missing files; that propagates correctly.

- [ ] **Step 4: Run all tests**

```bash
uv run pytest -q
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Python sidecar /phash endpoint via imagehash"
```

### Task 6: Faces endpoint (Haar cascade)

- [ ] **Step 1: Write failing test `tests/test_faces.py`**

```python
from pathlib import Path

from server.faces import detect_faces


FIX = Path(__file__).parent.parent / "fixtures"


def test_detect_faces_returns_list_of_boxes() -> None:
    result = detect_faces(str(FIX / "face.jpg"))
    assert isinstance(result, list)
    # Each entry should be a dict with x, y, w, h ints.
    for box in result:
        assert set(box.keys()) >= {"x", "y", "w", "h"}
        assert all(isinstance(box[k], int) for k in ("x", "y", "w", "h"))


def test_detect_faces_on_sharp_returns_empty_or_few() -> None:
    # The checkerboard fixture has no faces; should return [] (occasionally
    # cascade false-positives, so we allow up to 2 by tolerance).
    result = detect_faces(str(FIX / "sharp.jpg"))
    assert len(result) <= 2
```

Note: Haar cascades are NOT robust on the synthetic `face.jpg` fixture, so the first test deliberately asserts shape, not count. The second tolerates false positives on the checkerboard. If shipping real face fixtures becomes worthwhile in Phase 2b, the test can be tightened.

Run — should FAIL.

- [ ] **Step 2: Write `src/server/faces.py`**

```python
"""Face detection via OpenCV's bundled Haar cascade.

Haar is not state-of-the-art (Phase 2b may swap to YuNet or InsightFace),
but it ships free with opencv-python and produces useful face counts for
the scoring pipeline. False positive / false negative rates are
acceptable for v1 since the downstream consumer is a soft scoring
signal, not a hard filter.
"""
import os

import cv2


_CASCADE_PATH = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")


def detect_faces(path: str) -> list[dict[str, int]]:
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"could not decode image: {path}")
    detector = cv2.CascadeClassifier(_CASCADE_PATH)
    if detector.empty():
        raise RuntimeError(f"could not load cascade at {_CASCADE_PATH}")
    # detectMultiScale returns numpy array of (x, y, w, h) tuples; if no
    # faces, it can return an empty tuple (not an ndarray) depending on
    # opencv version — guard with `len`.
    boxes = detector.detectMultiScale(
        img, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
    )
    result: list[dict[str, int]] = []
    for (x, y, w, h) in boxes:
        result.append({"x": int(x), "y": int(y), "w": int(w), "h": int(h)})
    return result
```

Tests pass.

- [ ] **Step 3: Add `/faces` route in `app.py`**

```python
from server.faces import detect_faces

# inside build_app:
    class FacesRequest(BaseModel):
        path: str

    @app.post("/faces")
    async def faces(req: FacesRequest) -> dict[str, object]:
        try:
            boxes = detect_faces(req.path)
            return {"count": len(boxes), "boxes": boxes}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
```

- [ ] **Step 4: All tests**

```bash
uv run pytest -q
```

Expected: ~8 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Python sidecar /faces endpoint (Haar cascade)"
```

---

## Phase 2A.3 — Tauri ↔ Python Wiring

### Task 7: Spawn Python sidecar from Tauri

- [ ] **Step 1: Create `src-tauri/src/py_sidecar.rs`**

This mirrors `sidecar.rs` (the Node one) almost exactly. Differences: spawns `python` from the py-sidecar venv, different state struct, different command name.

```rust
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

#[cfg(windows)]
fn strip_unc_prefix(p: PathBuf) -> PathBuf {
  let s = p.to_string_lossy();
  if let Some(rest) = s.strip_prefix(r"\\?\") {
    PathBuf::from(rest)
  } else {
    p
  }
}

#[cfg(not(windows))]
fn strip_unc_prefix(p: PathBuf) -> PathBuf {
  p
}

pub struct PySidecarState {
  pub port: Mutex<Option<u16>>,
  pub child: Mutex<Option<Child>>,
}

pub async fn start_py_sidecar(app: &AppHandle) -> Result<u16, String> {
  let resource_dir = app
    .path()
    .resource_dir()
    .map_err(|e| format!("resource_dir: {e}"))?;
  let py_dir = if cfg!(debug_assertions) {
    let raw = resource_dir.join("../../../py-sidecar");
    let canon = raw
      .canonicalize()
      .map_err(|e| format!("canonicalize py-sidecar dir {}: {e}", raw.display()))?;
    strip_unc_prefix(canon)
  } else {
    resource_dir.join("py-sidecar")
  };

  // The venv's python lives at .venv/bin/python on Unix, .venv/Scripts/python.exe on Windows.
  let python_exe = if cfg!(windows) {
    py_dir.join(".venv").join("Scripts").join("python.exe")
  } else {
    py_dir.join(".venv").join("bin").join("python")
  };

  let mut child = Command::new(&python_exe)
    .arg("-m")
    .arg("server")
    .stdout(Stdio::piped())
    .stderr(Stdio::inherit())
    .current_dir(&py_dir)
    .spawn()
    .map_err(|e| format!("spawn py sidecar ({}): {e}", python_exe.display()))?;

  let stdout = child.stdout.take().ok_or("no stdout")?;
  let mut reader = BufReader::new(stdout).lines();

  let port = tokio::time::timeout(std::time::Duration::from_secs(60), async {
    while let Ok(Some(line)) = reader.next_line().await {
      if let Some(rest) = line.strip_prefix("SIDECAR_READY ") {
        return rest.trim().parse::<u16>().ok();
      }
    }
    None
  })
  .await
  .map_err(|_| "py sidecar startup timed out".to_string())?
  .ok_or("py sidecar did not announce port")?;

  let state = app.state::<PySidecarState>();
  *state.port.lock().unwrap() = Some(port);
  *state.child.lock().unwrap() = Some(child);
  Ok(port)
}

#[tauri::command]
pub fn py_sidecar_port(state: tauri::State<PySidecarState>) -> Option<u16> {
  *state.port.lock().unwrap()
}
```

Note the 60s timeout (vs 30s for Node) — uvicorn cold-start with opencv import is slower than fastify.

- [ ] **Step 2: Register in `lib.rs`**

Add `mod py_sidecar;` near the top with the other modules. Update the Builder chain:

```rust
.manage(PySidecarState {
  port: Default::default(),
  child: Default::default(),
})
```

Add `py_sidecar_port` to the `invoke_handler` macro list.

Inside the `setup` closure, alongside the existing Node-sidecar spawn, add:

```rust
let handle2 = app.handle().clone();
tauri::async_runtime::spawn(async move {
  if let Err(e) = py_sidecar::start_py_sidecar(&handle2).await {
    eprintln!("Py sidecar failed to start: {e}");
  }
});
```

- [ ] **Step 3: Verify build**

```bash
cd src-tauri && cargo check && cd ..
```

- [ ] **Step 4: Manual smoke (skip — subagent can't run tauri dev)**

Note in the report: manual `npm run tauri dev` should now spawn TWO sidecars (Node + Python). Stderr will surface either's startup errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Spawn Python sidecar from Tauri alongside Node"
```

### Task 8: Python sidecar client (TS)

- [ ] **Step 1: Create `src/lib/sidecar/py-client.ts`**

```ts
import { invoke } from '@tauri-apps/api/core';

let _port: number | null = null;

export async function pySidecarPort(): Promise<number> {
  if (_port !== null) return _port;
  for (let i = 0; i < 120; i++) {  // 120 × 500ms = 60s
    const p = await invoke<number | null>('py_sidecar_port');
    if (p) { _port = p; return p; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Python sidecar did not start within 60s');
}

async function pyFetch<T>(path: string, body?: unknown): Promise<T> {
  const port = await pySidecarPort();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Py sidecar ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface PyFaceBox { x: number; y: number; w: number; h: number; }

export async function blurViaPy(path: string): Promise<number> {
  const r = await pyFetch<{ blur: number }>('/blur', { path });
  return r.blur;
}

export async function phashViaPy(path: string): Promise<string> {
  const r = await pyFetch<{ phash: string }>('/phash', { path });
  return r.phash;
}

export async function facesViaPy(path: string): Promise<{ count: number; boxes: PyFaceBox[] }> {
  return pyFetch<{ count: number; boxes: PyFaceBox[] }>('/faces', { path });
}
```

**IMPORTANT:** Python's FastAPI does NOT add CORS headers by default. The renderer's fetch from `http://localhost:1420` to `http://127.0.0.1:<port>` will fail with CORS just like the Node sidecar did. Add `fastapi.middleware.cors.CORSMiddleware` in `app.py`:

In `py-sidecar/src/server/app.py`, after `app = FastAPI(...)`:

```python
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
```

(Safe because the sidecar binds to 127.0.0.1 only.)

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Python sidecar client + CORS middleware"
```

---

## Phase 2A.4 — CV Pass in the Indexer

### Task 9: Extend `scanner.ts` to call the CV sidecar

- [ ] **Step 1: Update `src/lib/indexing/scanner.ts`**

Replace the existing loop body to add a CV pass after the upsert. Key: CV is cached separately by `cv_score.computed_at`, so changing CV doesn't redo thumbnails, and vice versa.

```ts
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import {
  upsertPhoto, getProject, listIndexedAtByPath,
  upsertCvScore, listCvComputedAtByPhotoId, listPhotos,
} from '$lib/db';
import { readExifViaSidecar, makeThumbViaSidecar } from '$lib/sidecar/client';
import { blurViaPy, phashViaPy, facesViaPy } from '$lib/sidecar/py-client';
import { indexProgress } from './progress';
import { detectDuplicates } from './dedup';

interface ScannedFile { path: string; size: number; modified: number; }

export async function indexProject(projectId: number): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  indexProgress.set({ phase: 'walking', scanned: 0, total: 0, current: project.source_dir, errors: [], projectId });
  const files = await invoke<ScannedFile[]>('walk_image_dir', { dir: project.source_dir });
  const total = files.length;

  const lastIndexedByPath = await listIndexedAtByPath(projectId);

  const appDir = await appDataDir();
  const thumbDir = await join(appDir, 'projects', String(projectId), 'thumbs');

  indexProgress.update((p) => ({ ...p, phase: 'indexing', total }));

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    indexProgress.update((p) => ({ ...p, scanned: i, current: f.path }));

    const prev = lastIndexedByPath.get(f.path);
    if (prev !== undefined && prev >= f.modified * 1000) {
      continue;
    }

    try {
      const sha256 = await invoke<string>('hash_file', { path: f.path });
      const exif = await readExifViaSidecar(f.path);
      const thumbPath = await join(thumbDir, `${sha256}.jpg`);
      await makeThumbViaSidecar(f.path, thumbPath, 256);

      await upsertPhoto({
        project_id: projectId,
        path: f.path,
        sha256,
        taken_at: exif.taken_at ? Date.parse(exif.taken_at) : (f.modified * 1000),
        width: exif.width,
        height: exif.height,
        orientation: exif.orientation,
        exif_json: exif.exif_json,
        thumb_path: thumbPath,
        indexed_at: Date.now(),
      });
    } catch (err) {
      indexProgress.update((p) => ({ ...p, errors: [...p.errors, `${f.path}: ${err}`] }));
    }
  }

  // ---- CV PASS ----
  indexProgress.update((p) => ({ ...p, phase: 'indexing', current: 'running CV pass…' }));
  const photos = await listPhotos(projectId);
  const cvComputed = await listCvComputedAtByPhotoId(projectId);

  for (let i = 0; i < photos.length; i++) {
    const ph = photos[i];
    indexProgress.update((p) => ({ ...p, scanned: i, total: photos.length, current: `cv: ${ph.path}` }));

    if (cvComputed.has(ph.id)) {
      // Already scored after the last index of this photo — skip.
      const lastIndexed = ph.indexed_at;
      const lastCv = cvComputed.get(ph.id)!;
      if (lastCv >= lastIndexed) continue;
    }

    try {
      const [blur, phash, facesResult] = await Promise.all([
        blurViaPy(ph.path),
        phashViaPy(ph.path),
        facesViaPy(ph.path),
      ]);
      await upsertCvScore({
        photo_id: ph.id,
        blur,
        faces_count: facesResult.count,
        faces_json: JSON.stringify(facesResult.boxes),
        phash,
        computed_at: Date.now(),
      });
    } catch (err) {
      indexProgress.update((p) => ({ ...p, errors: [...p.errors, `cv ${ph.path}: ${err}`] }));
    }
  }

  // ---- DEDUP PASS ----
  indexProgress.update((p) => ({ ...p, current: 'detecting duplicates…' }));
  await detectDuplicates(projectId);

  indexProgress.update((p) => ({ ...p, phase: 'done', scanned: total }));
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Should succeed (`detectDuplicates` is imported from `./dedup` which Task 10 creates — TypeScript may error here until Task 10 lands. If so, defer this build check until after Task 10).

- [ ] **Step 3: Commit (after Task 10 lands the dedup module)**

Hold this commit; combine with Task 10's so the build passes.

### Task 10: Duplicate detection (pHash Hamming distance)

- [ ] **Step 1: Write `src/lib/indexing/dedup.ts`**

```ts
import {
  clearDuplicateGroups, insertDuplicateGroup, listPhotos, listCvScoresByProject,
} from '$lib/db';
import type { PhotoRow, CvScoreRow } from '$lib/db/types';

const HAMMING_THRESHOLD = 6;  // 0–64 bits differ between near-duplicates

function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    // popcount on a nibble
    d += [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4][x];
  }
  return d;
}

interface PhotoWithCv {
  id: number;
  path: string;
  phash: string;
  blur: number | null;
}

/** Greedy clustering: each photo joins the first existing group whose
 *  representative is within HAMMING_THRESHOLD. Sharpest member of the
 *  group is promoted to representative when assignments settle.
 */
export async function detectDuplicates(projectId: number): Promise<void> {
  await clearDuplicateGroups(projectId);

  const photos = await listPhotos(projectId);
  const cvScores = await listCvScoresByProject(projectId);
  const cvById = new Map(cvScores.map((c) => [c.photo_id, c]));

  const withCv: PhotoWithCv[] = [];
  for (const p of photos) {
    const cv = cvById.get(p.id);
    if (!cv?.phash) continue;
    withCv.push({ id: p.id, path: p.path, phash: cv.phash, blur: cv.blur });
  }

  // Sort by descending blur so the sharpest photo is a candidate
  // representative for any group it starts.
  withCv.sort((a, b) => (b.blur ?? 0) - (a.blur ?? 0));

  type Group = { repId: number; repPhash: string; repBlur: number; memberIds: number[] };
  const groups: Group[] = [];

  for (const p of withCv) {
    let joined: Group | null = null;
    for (const g of groups) {
      if (hammingHex(p.phash, g.repPhash) <= HAMMING_THRESHOLD) {
        joined = g;
        break;
      }
    }
    if (joined) {
      joined.memberIds.push(p.id);
      // Promote sharper member to rep.
      if ((p.blur ?? 0) > joined.repBlur) {
        joined.repId = p.id;
        joined.repPhash = p.phash;
        joined.repBlur = p.blur ?? 0;
      }
    } else {
      groups.push({
        repId: p.id, repPhash: p.phash, repBlur: p.blur ?? 0, memberIds: [p.id],
      });
    }
  }

  // Persist only groups with 2+ members (single-photo "groups" are noise).
  for (const g of groups) {
    if (g.memberIds.length < 2) continue;
    await insertDuplicateGroup({
      project_id: projectId,
      representative_photo_id: g.repId,
      member_photo_ids: g.memberIds,
    });
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Both `scanner.ts` and `dedup.ts` should now compile cleanly.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "CV pass + dedup detection in scanner"
```

---

## Phase 2A.5 — UI

### Task 11: Library grid surfaces CV indicators

- [ ] **Step 1: Update `src/routes/projects/[id]/library/+page.ts`**

Replace with:

```ts
import { getProject, listPhotos, listCvScoresByProject, listDuplicateMembersByPhoto } from '$lib/db';
import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export async function load({ params }) {
  const id = Number(params.id);
  const project = await getProject(id);
  if (!project) throw error(404, 'Project not found');
  const photos = await listPhotos(id);
  const cvs = await listCvScoresByProject(id);
  const dupGroupByPhoto = await listDuplicateMembersByPhoto(id);
  const cvById = new Map(cvs.map((c) => [c.photo_id, c]));
  return { project, photos, cvById, dupGroupByPhoto };
}
```

- [ ] **Step 2: Update `src/routes/projects/[id]/library/+page.svelte`**

Replace the figure block to show blur / faces / dup indicators:

```svelte
<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { Users, Copy } from 'lucide-svelte';

  let { data } = $props();

  function fmtDate(t: number | null): string {
    if (!t) return '—';
    return new Date(t).toLocaleDateString();
  }

  // Blur score thresholds: empirical, refine later.
  function blurBadge(blur: number | null): string {
    if (blur === null) return '';
    if (blur < 100) return 'blurry';
    if (blur < 300) return 'soft';
    return '';  // sharp — no badge
  }
</script>

<div class="container-page" style="max-width: 1000px;">
  <PageHeader backHref={`/projects/${data.project.id}`}>
    <h1 class="text-xl font-medium">{data.project.name} — library</h1>
  </PageHeader>

  <p class="text-sm mt-2" style="color: var(--color-muted)">{data.photos.length} photos</p>

  <div class="grid grid-cols-4 gap-2 mt-4">
    {#each data.photos as photo}
      {@const cv = data.cvById.get(photo.id)}
      {@const dupGroup = data.dupGroupByPhoto.get(photo.id)}
      {@const bb = blurBadge(cv?.blur ?? null)}
      <figure class="surface-card p-1 relative">
        {#if photo.thumb_path}
          <img src={convertFileSrc(photo.thumb_path)} alt="" class="w-full aspect-square object-cover rounded" />
        {:else}
          <div class="w-full aspect-square" style="background: var(--color-line)"></div>
        {/if}
        <div class="absolute top-2 right-2 flex flex-col gap-1 items-end">
          {#if bb}
            <span class="text-xs px-1 rounded" style="background: var(--color-warning); color: var(--color-bg)">{bb}</span>
          {/if}
          {#if cv && (cv.faces_count ?? 0) > 0}
            <span class="text-xs px-1 rounded flex items-center gap-0.5" style="background: var(--color-surface); color: var(--color-fg); border: 1px solid var(--color-line)">
              <Users size={10} /> {cv.faces_count}
            </span>
          {/if}
          {#if dupGroup !== undefined}
            <span class="text-xs px-1 rounded flex items-center gap-0.5" title="Member of duplicate group {dupGroup}" style="background: var(--color-surface); color: var(--color-muted); border: 1px solid var(--color-line)">
              <Copy size={10} />
            </span>
          {/if}
        </div>
        <figcaption class="text-xs mt-1 truncate" style="color: var(--color-muted)" title={photo.path}>
          {fmtDate(photo.taken_at)}
        </figcaption>
      </figure>
    {/each}
  </div>
</div>
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add -A
git commit -m "Library grid: blur, faces, dup-group indicators"
```

---

## Phase 2A.6 — Close-out

### Task 12: README + Phase 2a tag

- [ ] **Step 1: Update `README.md`**

Replace the "Status" section:

```markdown
## Status

**Phase 1 (Foundation) — complete.** App indexes a folder into SQLite with thumbnails + EXIF and shows the library as a grid.

**Phase 2a (CV pipeline) — complete.** Python sidecar runs blur + face detection + perceptual hash on every indexed photo. Duplicate groups are detected via pHash Hamming distance. Library grid shows blur, face count, and dup-group indicators per thumbnail.

Phase 2b (embeddings + scene tags + face clustering), Phase 3 (selection + layout), and Phase 4 (PDF export + LLM captions) are planned but not yet implemented.

See `docs/superpowers/specs/2026-05-14-family-album-builder-design.md` for the design.
```

Add a "Setup" subsection mentioning the Python toolchain:

```markdown
## Development

Requires: Node ≥ 20, Rust toolchain (for Tauri v2), Python ≥ 3.11, `uv` (https://docs.astral.sh/uv/).

```bash
npm install
cd sidecar && npm install && cd ..
cd py-sidecar && uv sync && cd ..
npm run tauri dev
```

Run Python sidecar tests:

```bash
cd py-sidecar && uv run pytest
```
```

- [ ] **Step 2: Copy this plan into the repo**

```bash
cp /Users/meigo/Projects/slop/slop-ideas/docs/superpowers/plans/2026-05-15-family-album-phase-2a-cv-pipeline.md \
   /Users/meigo/Projects/slop/slop-family-album/docs/superpowers/plans/
```

- [ ] **Step 3: Commit + tag + push**

```bash
git add -A
git commit -m "Phase 2a close-out: README, plan copy"
git tag phase-2a-cv-pipeline
git push origin main
git push origin phase-2a-cv-pipeline
```

---

## Phase 2a Definition of Done

- [ ] `npm run tauri dev` launches and spawns BOTH sidecars (Node + Python) successfully.
- [ ] Migration 002 runs cleanly on existing slop-family-album databases (additive — no breakage of Phase 1 data).
- [ ] Indexing a folder now also writes `cv_score` rows: blur, faces_count, faces_json, phash, computed_at.
- [ ] Duplicate-group detection runs after indexing and writes `duplicate_group` + `duplicate_group_member` rows.
- [ ] Library grid shows: thumbnail, date, blur badge (when blurry/soft), face count badge (when ≥1 face), dup-group badge (when in a group).
- [ ] Re-running "Index now" skips already-CV-scored photos (cache works on the CV pass too).
- [ ] Python sidecar tests pass via `uv run pytest`.
- [ ] All existing automated tests still pass (Rust, Node sidecar, Playwright).
- [ ] No photo data leaves the machine.

---

## Out of Phase 2a (covered later)

- Image embeddings (OpenCLIP / SigLIP) — **Phase 2b**
- Scene tags (zero-shot classification) — **Phase 2b**
- Face clustering into named persons (`person_cluster`) — **Phase 2b**
- Exposure / composition scoring — **Phase 2b**
- Aggregate `score` table with constraint-driven weights — **Phase 3**
- Selection algorithms (album, calendar seasonal-memory) — **Phase 3**
- Layout engine + page templates — **Phase 3**
- PDF export — **Phase 4**
- Ollama / Claude captioning — **Phase 4**
- Production sidecar bundling (currently dev-mode only, requires uv on host) — **Phase 4**
