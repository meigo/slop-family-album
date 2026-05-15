# Family Album & Calendar Builder — Phase 2b (Semantic CV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add semantic computer-vision signals on top of Phase 2a's blur/faces/phash: **image embeddings** (OpenCLIP for similarity), **scene tags** (zero-shot classification using the same model), **face embeddings + clustering** (group photos of the same person into reviewable, nameable clusters), and **exposure scoring** (histogram-based, complements blur). End state: each photo has a CLIP embedding, a set of scene-tag scores, and each detected face has an embedding + a `person_cluster` membership. A "People" page lets the user name unnamed clusters.

**Architecture:** Extend the Python sidecar with two new ML capabilities — OpenCLIP for whole-image embeddings + zero-shot tag scoring (via `open_clip_torch` + bundled or auto-downloaded ViT-B/32 weights) and SFace for per-face 128-dim embeddings (via `cv2.FaceRecognizerSF` + bundled ONNX model). Migration 003 adds `image_embedding`, `face`, `person_cluster`, and `photo_tag` tables, plus an `exposure` column on `cv_score`. The renderer extends the scanner's CV pass to call the new endpoints, and a TS clustering module runs greedy DBSCAN over face embeddings after every CV pass.

**Tech Stack additions:** `open_clip_torch>=2.24`, `torch>=2.0` (CPU wheels), pretrained `ViT-B-32` weights (downloaded on first use, ~150 MB cached), `face_recognition_sface_2021dec.onnx` (bundled, ~37 MB Apache-2.0 from opencv_zoo). No new JS/Rust deps.

**Spec reference:** `slop-ideas/docs/superpowers/specs/2026-05-14-family-album-builder-design.md`

**Working directory:** All tasks run from `/Users/meigo/Projects/slop/slop-family-album/` unless otherwise specified.

**Phase 2b NOT in scope** (deferred):
- Aggregate `score` table with constraint-driven weights — **Phase 3**
- Selection algorithms (album chronological, calendar seasonal-memory) — **Phase 3**
- "Similar photos" search UI — **Phase 3 or 4**
- Audio-aware tagging — never (out of project scope)
- Re-clustering UI (merge / split clusters) — **Phase 2c if needed**
- Production sidecar bundling — **Phase 4**

---

## File Structure (Phase 2b additions)

```
slop-family-album/
  py-sidecar/
    models/
      face_recognition_sface_2021dec.onnx  # NEW (Apache-2.0, opencv_zoo)
      MODEL_SOURCE.md                       # update with second model
    src/server/
      embed.py                              # NEW — OpenCLIP image + text embed
      tags.py                               # NEW — zero-shot scene classification
      face_embed.py                         # NEW — SFace per-face embedding
      exposure.py                           # NEW — histogram-based score
      faces.py                              # MODIFIED — also returns embeddings
      app.py                                # MODIFIED — register new routes
    tests/
      test_embed.py
      test_tags.py
      test_face_embed.py
      test_exposure.py
    scripts/
      make_fixtures.py                      # MODIFIED — add real-face fixture(s)
  src-tauri/migrations/
    003_semantic_cv.sql                     # NEW
  src/lib/
    db/
      index.ts                              # add helpers for new tables
      types.ts                              # add new row types
    sidecar/
      py-client.ts                          # add new endpoint wrappers
    indexing/
      scanner.ts                            # extend CV pass
      face-clustering.ts                    # NEW — greedy DBSCAN-ish over face embeddings
  src/routes/projects/[id]/
    people/
      +page.ts                              # NEW — list clusters
      +page.svelte                          # NEW — name clusters, pin "must-include"
    library/
      +page.svelte                          # MODIFIED — surface top tag + exposure
```

---

## Phase 2B.1 — Schema

### Task 1: Migration 003_semantic_cv.sql

- [ ] **Step 1: Create `src-tauri/migrations/003_semantic_cv.sql`**

```sql
-- Add exposure scoring to cv_score (alongside blur, faces_count, phash).
ALTER TABLE cv_score ADD COLUMN exposure REAL;

-- Whole-image embeddings from OpenCLIP. Stored as float32 BLOB; 512-dim
-- for ViT-B/32. Renderer can decode via DataView when computing
-- "similar photos" queries.
CREATE TABLE image_embedding (
  photo_id INTEGER PRIMARY KEY REFERENCES photo(id) ON DELETE CASCADE,
  model TEXT NOT NULL,         -- e.g. 'ViT-B-32/openai' for cache invalidation
  vector BLOB NOT NULL,        -- float32 array, little-endian
  computed_at INTEGER NOT NULL
);

-- Zero-shot scene tags via OpenCLIP. One row per (photo, tag) pair so
-- we can WHERE-filter by tag efficiently. Score is the softmax over a
-- fixed prompt list, so all rows for one photo sum to ~1.
CREATE TABLE photo_tag (
  photo_id INTEGER NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  score REAL NOT NULL,
  PRIMARY KEY (photo_id, tag)
);

CREATE INDEX idx_photo_tag_tag ON photo_tag (tag, score);

-- Per-face row with bbox + 128-dim SFace embedding. Phase 2a stored
-- faces as `faces_json` on cv_score; we now break them out into
-- individual rows so each face can carry an embedding and a cluster
-- assignment. cv_score.faces_count / faces_json remain a denormalized
-- cache for the library grid.
CREATE TABLE face (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  bbox_x INTEGER NOT NULL,
  bbox_y INTEGER NOT NULL,
  bbox_w INTEGER NOT NULL,
  bbox_h INTEGER NOT NULL,
  embedding BLOB NOT NULL,     -- 128-dim float32 (SFace)
  quality REAL,                -- detector confidence × normalized size
  cluster_id INTEGER REFERENCES person_cluster(id) ON DELETE SET NULL,
  computed_at INTEGER NOT NULL
);

CREATE INDEX idx_face_photo ON face (photo_id);
CREATE INDEX idx_face_cluster ON face (cluster_id);

-- Named groups of similar faces. The user names them via the People page;
-- pinning a cluster makes it "always include when present" in Phase 3
-- selection.
CREATE TABLE person_cluster (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT,                   -- null = unnamed
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_person_cluster_project ON person_cluster (project_id);
```

- [ ] **Step 2: Register migration 003 in `src-tauri/src/lib.rs`**

Append to the existing `migrations()` vec:

```rust
tauri_plugin_sql::Migration {
  version: 3,
  description: "semantic_cv_embeddings_tags_faces",
  sql: include_str!("../migrations/003_semantic_cv.sql"),
  kind: tauri_plugin_sql::MigrationKind::Up,
},
```

- [ ] **Step 3: Build verification**

```bash
cd src-tauri && cargo check && cd ..
npm run build
```

Both must succeed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Migration 003: image_embedding + photo_tag + face + person_cluster"
```

### Task 2: DB module additions

- [ ] **Step 1: Extend `src/lib/db/types.ts`**

Append:

```ts
export interface ImageEmbeddingRow {
  photo_id: number;
  model: string;
  vector: Uint8Array;
  computed_at: number;
}

export interface PhotoTagRow {
  photo_id: number;
  tag: string;
  score: number;
}

export interface FaceRow {
  id: number;
  photo_id: number;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  embedding: Uint8Array;
  quality: number | null;
  cluster_id: number | null;
  computed_at: number;
}

export interface FaceInsert {
  photo_id: number;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  embedding: Uint8Array;
  quality: number | null;
  computed_at: number;
}

export interface PersonClusterRow {
  id: number;
  project_id: number;
  name: string | null;
  is_pinned: number;       // 0 or 1
  created_at: number;
}
```

- [ ] **Step 2: Extend `src/lib/db/index.ts`**

Update the existing type import line to include the new types, then append:

```ts
export async function upsertImageEmbedding(args: {
  photo_id: number;
  model: string;
  vector: Uint8Array;
  computed_at: number;
}): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO image_embedding (photo_id, model, vector, computed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (photo_id) DO UPDATE SET
       model = excluded.model,
       vector = excluded.vector,
       computed_at = excluded.computed_at`,
    [args.photo_id, args.model, args.vector, args.computed_at]
  );
}

export async function listImageEmbeddingsComputedAt(projectId: number): Promise<Map<number, number>> {
  const d = await db();
  const rows = await d.select<{ photo_id: number; computed_at: number }[]>(
    `SELECT image_embedding.photo_id, image_embedding.computed_at
     FROM image_embedding
     INNER JOIN photo ON photo.id = image_embedding.photo_id
     WHERE photo.project_id = ?`,
    [projectId]
  );
  return new Map(rows.map((r) => [r.photo_id, r.computed_at]));
}

export async function replacePhotoTags(photoId: number, tags: Array<{ tag: string; score: number }>): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM photo_tag WHERE photo_id = ?', [photoId]);
  for (const t of tags) {
    await d.execute(
      'INSERT INTO photo_tag (photo_id, tag, score) VALUES (?, ?, ?)',
      [photoId, t.tag, t.score]
    );
  }
}

export async function listTopTagByPhoto(projectId: number): Promise<Map<number, { tag: string; score: number }>> {
  const d = await db();
  const rows = await d.select<{ photo_id: number; tag: string; score: number }[]>(
    `SELECT pt.photo_id, pt.tag, pt.score
     FROM photo_tag pt
     INNER JOIN photo p ON p.id = pt.photo_id
     WHERE p.project_id = ?
       AND pt.score = (
         SELECT MAX(score) FROM photo_tag WHERE photo_id = pt.photo_id
       )`,
    [projectId]
  );
  return new Map(rows.map((r) => [r.photo_id, { tag: r.tag, score: r.score }]));
}

export async function clearFacesForPhoto(photoId: number): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM face WHERE photo_id = ?', [photoId]);
}

export async function insertFace(f: FaceInsert): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `INSERT INTO face (photo_id, bbox_x, bbox_y, bbox_w, bbox_h, embedding, quality, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [f.photo_id, f.bbox_x, f.bbox_y, f.bbox_w, f.bbox_h, f.embedding, f.quality, f.computed_at]
  );
  return r.lastInsertId as number;
}

export async function listFacesByProject(projectId: number): Promise<FaceRow[]> {
  const d = await db();
  return d.select<FaceRow[]>(
    `SELECT face.*
     FROM face
     INNER JOIN photo ON photo.id = face.photo_id
     WHERE photo.project_id = ?
     ORDER BY face.id ASC`,
    [projectId]
  );
}

export async function setFaceCluster(faceId: number, clusterId: number | null): Promise<void> {
  const d = await db();
  await d.execute('UPDATE face SET cluster_id = ? WHERE id = ?', [clusterId, faceId]);
}

export async function clearPersonClusters(projectId: number): Promise<void> {
  const d = await db();
  // ON DELETE SET NULL on face.cluster_id keeps face rows; clusters disappear.
  await d.execute('DELETE FROM person_cluster WHERE project_id = ?', [projectId]);
}

export async function insertPersonCluster(projectId: number): Promise<number> {
  const d = await db();
  const r = await d.execute(
    'INSERT INTO person_cluster (project_id, name, is_pinned, created_at) VALUES (?, NULL, 0, ?)',
    [projectId, Date.now()]
  );
  return r.lastInsertId as number;
}

export async function listPersonClusters(projectId: number): Promise<PersonClusterRow[]> {
  const d = await db();
  return d.select<PersonClusterRow[]>(
    'SELECT * FROM person_cluster WHERE project_id = ? ORDER BY created_at ASC',
    [projectId]
  );
}

export async function updatePersonCluster(id: number, args: { name?: string | null; is_pinned?: boolean }): Promise<void> {
  const d = await db();
  if (args.name !== undefined) {
    await d.execute('UPDATE person_cluster SET name = ? WHERE id = ?', [args.name, id]);
  }
  if (args.is_pinned !== undefined) {
    await d.execute(
      'UPDATE person_cluster SET is_pinned = ? WHERE id = ?',
      [args.is_pinned ? 1 : 0, id]
    );
  }
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add -A
git commit -m "DB module: image_embedding, photo_tag, face, person_cluster helpers"
```

---

## Phase 2B.2 — Python sidecar: OpenCLIP

### Task 3: Add OpenCLIP dependency

- [ ] **Step 1: Update `py-sidecar/pyproject.toml` dependencies**

Add `open-clip-torch` and `torch` to the `[project] dependencies` list:

```toml
dependencies = [
  "fastapi>=0.110",
  "uvicorn[standard]>=0.30",
  "opencv-python-headless>=4.9",
  "pillow>=10.0",
  "imagehash>=4.3",
  "open-clip-torch>=2.24",
  "torch>=2.0",
]
```

(`torch` is a transitive of `open-clip-torch` but pinning it explicitly avoids surprise version bumps. Use CPU-only wheels — uv resolves these by default on macOS/Linux. On Windows, ensure no CUDA-specific wheel sneaks in by adding `[tool.uv.sources]` if needed; resolve only after first sync attempt.)

- [ ] **Step 2: Sync deps**

```bash
cd py-sidecar && uv sync
```

First run downloads torch (~300 MB) + open-clip-torch (~50 MB). Slow but one-time.

- [ ] **Step 3: Verify import works**

```bash
uv run python -c "import open_clip; print(open_clip.__version__)"
```

Expected: a version number prints. If GPU/CUDA errors surface, force CPU via uv extras or report BLOCKED with the exact error.

- [ ] **Step 4: Commit (no source code yet — just deps)**

```bash
cd /Users/meigo/Projects/slop/slop-family-album
git add py-sidecar/pyproject.toml py-sidecar/uv.lock
git commit -m "Add open-clip-torch + torch to Python sidecar deps"
```

### Task 4: /embed endpoint (OpenCLIP image embeddings)

- [ ] **Step 1: Write `py-sidecar/src/server/embed.py`**

```python
"""Whole-image embeddings via OpenCLIP ViT-B/32.

Embeddings are 512-dim float32. The model is loaded lazily once per
process and reused across requests. Weights are cached by open_clip
under `~/.cache/torch/hub/checkpoints/` (~150 MB).
"""
import io
import threading
from typing import Optional

import numpy as np
import open_clip
import torch
from PIL import Image


MODEL_NAME = "ViT-B-32"
PRETRAINED = "openai"
MODEL_KEY = f"{MODEL_NAME}/{PRETRAINED}"

_lock = threading.Lock()
_model: Optional[torch.nn.Module] = None
_preprocess = None
_tokenizer = None


def _ensure_loaded() -> None:
    global _model, _preprocess, _tokenizer
    with _lock:
        if _model is not None:
            return
        model, _, preprocess = open_clip.create_model_and_transforms(
            MODEL_NAME, pretrained=PRETRAINED
        )
        model.eval()
        _model = model
        _preprocess = preprocess
        _tokenizer = open_clip.get_tokenizer(MODEL_NAME)


def embed_image(path: str) -> tuple[bytes, str]:
    """Return (float32 little-endian bytes, model_key)."""
    _ensure_loaded()
    img = Image.open(path).convert("RGB")
    with torch.no_grad():
        x = _preprocess(img).unsqueeze(0)  # type: ignore[misc]
        feats = _model.encode_image(x)  # type: ignore[union-attr]
        feats = feats / feats.norm(dim=-1, keepdim=True)
    arr = feats.squeeze(0).cpu().numpy().astype(np.float32)
    return arr.tobytes(), MODEL_KEY


def embed_texts(prompts: list[str]) -> np.ndarray:
    """Return L2-normalized text embeddings (N, 512) for the prompt list."""
    _ensure_loaded()
    with torch.no_grad():
        tokens = _tokenizer(prompts)  # type: ignore[misc]
        feats = _model.encode_text(tokens)  # type: ignore[union-attr]
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.cpu().numpy().astype(np.float32)


def model_key() -> str:
    return MODEL_KEY
```

- [ ] **Step 2: Write `py-sidecar/tests/test_embed.py`**

```python
from pathlib import Path

import numpy as np

from server.embed import embed_image, model_key


FIX = Path(__file__).parent.parent / "fixtures"


def test_embed_returns_512_dim_float32() -> None:
    raw, key = embed_image(str(FIX / "sharp.jpg"))
    assert key == "ViT-B-32/openai"
    arr = np.frombuffer(raw, dtype=np.float32)
    assert arr.shape == (512,)
    # L2-normalized
    norm = float(np.linalg.norm(arr))
    assert abs(norm - 1.0) < 1e-4


def test_embed_consistent_across_calls() -> None:
    raw1, _ = embed_image(str(FIX / "sharp.jpg"))
    raw2, _ = embed_image(str(FIX / "sharp.jpg"))
    a = np.frombuffer(raw1, dtype=np.float32)
    b = np.frombuffer(raw2, dtype=np.float32)
    # Deterministic given torch.eval() and no dropout
    assert np.allclose(a, b, atol=1e-5)
```

Run the test once before adding the route — first call downloads the ~150 MB pretrained weights. Expect a slow first run.

```bash
cd py-sidecar && uv run pytest -q tests/test_embed.py
```

Expected: 2 passed (after the initial download).

- [ ] **Step 3: Register `/embed` route in `app.py`**

Add to the imports + route block:

```python
import base64

from server.embed import embed_image, model_key


class EmbedRequest(BaseModel):
    path: str

# inside build_app() after /faces:

    @app.post("/embed")
    async def embed(req: EmbedRequest) -> dict[str, str]:
        try:
            raw, mk = embed_image(req.path)
            return {
                "model": mk,
                "vector_b64": base64.b64encode(raw).decode("ascii"),
            }
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
```

(Base64 because Fastify-style JSON doesn't pass bytes natively. Renderer decodes b64 → Uint8Array → stores as SQLite BLOB.)

- [ ] **Step 4: Add integration test to `test_app.py`**

```python
def test_embed_endpoint_returns_b64() -> None:
    app = build_app()
    client = TestClient(app)
    r = client.post("/embed", json={"path": str(FIX / "sharp.jpg")})
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "ViT-B-32/openai"
    assert len(body["vector_b64"]) > 1000  # 512 * 4 bytes b64-encoded ≈ 2730 chars
```

- [ ] **Step 5: Run all tests**

```bash
uv run pytest -q
```

Expected: 11 passed (9 from before + 2 from test_embed + extra integration test in test_app).

- [ ] **Step 6: Commit**

```bash
cd /Users/meigo/Projects/slop/slop-family-album
git add -A
git commit -m "Python sidecar /embed endpoint (OpenCLIP ViT-B/32)"
```

### Task 5: /tags endpoint (zero-shot scene tags)

- [ ] **Step 1: Write `py-sidecar/src/server/tags.py`**

```python
"""Zero-shot scene tagging via OpenCLIP.

Given a fixed prompt list, compute similarity between the image embedding
and each prompt's text embedding, then softmax to get a probability
distribution. Returns the top-K labels.

The prompt list is curated for the photo-album use case: indoor/outdoor,
season hints, scene categories, and a few common photographic genres.
Phase 2c can expand or fine-tune.
"""
import numpy as np

from server.embed import embed_image, embed_texts


# Each entry maps a short tag name → a descriptive prompt for OpenCLIP.
# OpenCLIP performs best with full natural-language prompts.
TAG_PROMPTS: dict[str, str] = {
    "indoor": "a photo taken indoors",
    "outdoor": "a photo taken outdoors",
    "portrait": "a portrait photograph of a person",
    "group_portrait": "a group photo of several people",
    "landscape": "a wide landscape photograph",
    "food": "a photograph of food on a plate",
    "celebration": "a photo of a birthday or celebration",
    "beach": "a photo at a beach with sand and water",
    "snow": "a photo with snow",
    "forest": "a photo in a forest",
    "city": "a photo of a city street",
    "child": "a photo of a child",
    "pet": "a photo of a pet animal",
    "document": "a photograph of a document or screenshot of text",
    "screenshot": "a screenshot of a computer or phone screen",
}

# Precompute text embeddings on first use.
_text_embeddings: np.ndarray | None = None
_tags: list[str] | None = None


def _ensure_text_embeddings() -> tuple[np.ndarray, list[str]]:
    global _text_embeddings, _tags
    if _text_embeddings is None or _tags is None:
        tags = list(TAG_PROMPTS.keys())
        prompts = [TAG_PROMPTS[t] for t in tags]
        _text_embeddings = embed_texts(prompts)
        _tags = tags
    return _text_embeddings, _tags


def score_tags(path: str, top_k: int = 5) -> list[dict[str, float]]:
    """Score the image against all tag prompts; return top_k by softmax score."""
    raw, _ = embed_image(path)
    img_vec = np.frombuffer(raw, dtype=np.float32)
    text_vecs, tag_names = _ensure_text_embeddings()
    # Cosine similarity (both already L2-normalized).
    sims = text_vecs @ img_vec
    # Temperature-scaled softmax. Temperature ~100 is OpenCLIP's calibration.
    scaled = sims * 100.0
    probs = np.exp(scaled - scaled.max())
    probs /= probs.sum()
    order = np.argsort(-probs)[:top_k]
    return [{"tag": tag_names[i], "score": float(probs[i])} for i in order]
```

- [ ] **Step 2: Write `py-sidecar/tests/test_tags.py`**

```python
from pathlib import Path

from server.tags import score_tags


FIX = Path(__file__).parent.parent / "fixtures"


def test_score_tags_returns_top_k() -> None:
    result = score_tags(str(FIX / "sharp.jpg"), top_k=5)
    assert isinstance(result, list)
    assert len(result) == 5
    for entry in result:
        assert set(entry.keys()) == {"tag", "score"}
        assert isinstance(entry["score"], float)
        assert 0.0 <= entry["score"] <= 1.0
    # Top-K should be sorted descending by score
    scores = [e["score"] for e in result]
    assert scores == sorted(scores, reverse=True)


def test_score_tags_total_below_one() -> None:
    # Top-5 of a softmax-distributed set should sum to < 1.0
    result = score_tags(str(FIX / "sharp.jpg"), top_k=5)
    total = sum(e["score"] for e in result)
    assert total <= 1.0001
```

Run:

```bash
uv run pytest -q tests/test_tags.py
```

Expected: 2 passed.

- [ ] **Step 3: Register `/tags` route in `app.py`**

```python
from server.tags import score_tags


class TagsRequest(BaseModel):
    path: str
    top_k: int = 5


# inside build_app() after /embed:

    @app.post("/tags")
    async def tags(req: TagsRequest) -> dict[str, list[dict[str, float]]]:
        try:
            return {"tags": score_tags(req.path, top_k=req.top_k)}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 4: Run all tests + commit**

```bash
uv run pytest -q
```

Expected: 13 passed.

```bash
cd /Users/meigo/Projects/slop/slop-family-album
git add -A
git commit -m "Python sidecar /tags endpoint (OpenCLIP zero-shot)"
```

---

## Phase 2B.3 — Python sidecar: face embeddings

### Task 6: Bundle SFace model + face_embed.py + extend /faces

- [ ] **Step 1: Download SFace ONNX**

```bash
curl -L -o py-sidecar/models/face_recognition_sface_2021dec.onnx \
  https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx
ls -lh py-sidecar/models/
```

Expected: a ~37 MB file. If download fails, retry once or report BLOCKED.

- [ ] **Step 2: Update `py-sidecar/models/MODEL_SOURCE.md`**

Append:

```markdown

## `face_recognition_sface_2021dec.onnx`

OpenCV SFace face recognizer, December 2021 release. Produces 128-dim
L2-normalized embeddings per face crop.

Source: https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface

License: Apache-2.0.

Used by `server/face_embed.py` to compute per-face embeddings for
clustering. Bundled in-repo for the same deterministic-setup reasons as
YuNet.
```

- [ ] **Step 3: Write `py-sidecar/src/server/face_embed.py`**

```python
"""Per-face embeddings via OpenCV SFace.

SFace expects an aligned face crop. We extract the YuNet bounding box,
crop the original image, resize to 112×112 (SFace expected input), and
pass through the recognizer. Output is a 128-dim L2-normalized vector.

We also compute a 'quality' score = detector confidence (passed in from
YuNet, defaulting to 1.0 if absent) × normalized face size (face area /
image area), capped at 1.0. Quality is consumed by clustering to weight
representatives.
"""
import os
from pathlib import Path

import cv2
import numpy as np


_MODEL_PATH = str(Path(__file__).resolve().parents[2] / "models" / "face_recognition_sface_2021dec.onnx")
_recognizer = None


def _get_recognizer() -> "cv2.FaceRecognizerSF":
    global _recognizer
    if _recognizer is None:
        _recognizer = cv2.FaceRecognizerSF.create(_MODEL_PATH, "")
    return _recognizer


def embed_face_crop(img: np.ndarray, bbox: tuple[int, int, int, int]) -> bytes:
    """Crop the face from img using bbox (x,y,w,h), embed via SFace."""
    x, y, w, h = bbox
    # Clip to image bounds
    H, W = img.shape[:2]
    x = max(0, min(W - 1, x))
    y = max(0, min(H - 1, y))
    w = max(1, min(W - x, w))
    h = max(1, min(H - y, h))
    crop = img[y:y + h, x:x + w]
    # SFace expects 112×112 RGB
    crop = cv2.resize(crop, (112, 112))
    recognizer = _get_recognizer()
    # alignCrop expects 5-landmark format; we don't have landmarks, so
    # we skip alignment and pass the raw crop via feature(). This is
    # slightly less accurate than the aligned form but adequate for v1.
    feat = recognizer.feature(crop)
    # feature() returns (1, 128) float32; flatten + normalize
    vec = feat.flatten().astype(np.float32)
    vec /= max(1e-9, float(np.linalg.norm(vec)))
    return vec.tobytes()
```

- [ ] **Step 4: Modify `py-sidecar/src/server/faces.py`** to also return embeddings

Replace the existing `detect_faces` function with one that returns boxes + embeddings + quality:

```python
"""Face detection (YuNet) + embedding (SFace).

Returns one dict per face with bbox, embedding (b64-encoded float32),
and a 0-1 quality score. The HTTP layer in app.py reshapes this for the
/faces endpoint.
"""
import base64
import os
from pathlib import Path

import cv2
import numpy as np

from server.face_embed import embed_face_crop


_MODEL_PATH = str(Path(__file__).resolve().parents[2] / "models" / "face_detection_yunet_2023mar.onnx")
_DETECTORS: dict[tuple[int, int], "cv2.FaceDetectorYN"] = {}


def _get_detector(width: int, height: int) -> "cv2.FaceDetectorYN":
    key = (width, height)
    det = _DETECTORS.get(key)
    if det is None:
        det = cv2.FaceDetectorYN.create(
            model=_MODEL_PATH,
            config="",
            input_size=(width, height),
            score_threshold=0.6,
            nms_threshold=0.3,
            top_k=200,
        )
        _DETECTORS[key] = det
    return det


def detect_faces(path: str, with_embeddings: bool = False) -> list[dict[str, object]]:
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"could not decode image: {path}")

    H, W = img.shape[:2]
    detector = _get_detector(W, H)
    _, faces = detector.detect(img)
    if faces is None:
        return []

    result: list[dict[str, object]] = []
    for row in faces:
        x, y, fw, fh = row[0:4]
        confidence = float(row[14]) if len(row) > 14 else 1.0
        x = max(0, int(x))
        y = max(0, int(y))
        fw = max(0, min(W - x, int(fw)))
        fh = max(0, min(H - y, int(fh)))
        if fw == 0 or fh == 0:
            continue
        face_dict: dict[str, object] = {"x": x, "y": y, "w": fw, "h": fh}
        if with_embeddings:
            face_area = (fw * fh) / max(1.0, W * H)
            quality = float(min(1.0, confidence * (face_area / 0.05)))  # area >= 5% → full quality
            emb_bytes = embed_face_crop(img, (x, y, fw, fh))
            face_dict["embedding_b64"] = base64.b64encode(emb_bytes).decode("ascii")
            face_dict["quality"] = quality
        result.append(face_dict)
    return result
```

- [ ] **Step 5: Update `app.py` `/faces` route to accept `with_embeddings`**

```python
class FacesRequest(BaseModel):
    path: str
    with_embeddings: bool = False


    @app.post("/faces")
    async def faces(req: FacesRequest) -> dict[str, object]:
        try:
            entries = detect_faces(req.path, with_embeddings=req.with_embeddings)
            return {"count": len(entries), "faces": entries}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
```

(Note the response field renamed from `boxes` → `faces` to reflect richer content; older clients calling without `with_embeddings: true` still get the bbox-only shape per entry. UPDATE the TS client to read `faces` instead of `boxes`.)

- [ ] **Step 6: Update `tests/test_faces.py` to reflect the new shape**

```python
from pathlib import Path

from server.faces import detect_faces


FIX = Path(__file__).parent.parent / "fixtures"


def test_detect_faces_returns_list_of_boxes() -> None:
    result = detect_faces(str(FIX / "face.jpg"))
    assert isinstance(result, list)
    for box in result:
        assert set(box.keys()) >= {"x", "y", "w", "h"}
        assert all(isinstance(box[k], int) for k in ("x", "y", "w", "h"))
        # Embeddings off by default
        assert "embedding_b64" not in box


def test_detect_faces_on_sharp_returns_empty_or_few() -> None:
    result = detect_faces(str(FIX / "sharp.jpg"))
    assert len(result) <= 5


def test_detect_faces_with_embeddings_includes_b64_and_quality() -> None:
    result = detect_faces(str(FIX / "face.jpg"), with_embeddings=True)
    for box in result:
        assert "embedding_b64" in box
        assert "quality" in box
        assert isinstance(box["quality"], float)
        # 128 floats × 4 bytes = 512 bytes → b64 ≈ 684 chars
        assert len(box["embedding_b64"]) >= 600
```

Run:

```bash
uv run pytest -q
```

Expected: 14 passed (13 from before, +1 new — but test_app.py's existing `test_faces_*` tests may break since the response shape changed `boxes` → `faces`. Update those tests too.)

Check `tests/test_app.py` for any face-related assertions; update field name if needed.

- [ ] **Step 7: Commit**

```bash
cd /Users/meigo/Projects/slop/slop-family-album
git add -A
git commit -m "SFace face embeddings + extend /faces with with_embeddings flag"
```

### Task 7: /exposure endpoint

- [ ] **Step 1: Write `py-sidecar/src/server/exposure.py`**

```python
"""Exposure scoring via histogram analysis.

Score ∈ [0, 1] where 1 = well-exposed (histogram centered, full tonal range)
and 0 = severely under/over-exposed (histogram pushed to one end).

Algorithm:
- Compute brightness histogram on the grayscale image (256 bins).
- Penalty for fraction of pixels at the extremes (0-5 and 250-255).
- Penalty for skew (mean far from 128).
"""
import os

import cv2
import numpy as np


def exposure_score(path: str) -> float:
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"could not decode image: {path}")
    hist = cv2.calcHist([img], [0], None, [256], [0, 256]).flatten()
    total = hist.sum()
    if total == 0:
        return 0.0
    # Extreme-pixel fraction (clipped highlights + clipped shadows)
    dark = hist[:6].sum() / total
    bright = hist[250:].sum() / total
    clipped = dark + bright
    # Skew: distance of mean from 128, normalized to 0-1
    mean = float(np.mean(img))
    skew = abs(mean - 128.0) / 128.0
    # Combine: heavy penalty for clipping (>20%), moderate for skew
    score = 1.0 - min(1.0, 2.0 * clipped) - 0.3 * skew
    return max(0.0, min(1.0, float(score)))
```

- [ ] **Step 2: Write `py-sidecar/tests/test_exposure.py`**

```python
from pathlib import Path

from server.exposure import exposure_score


FIX = Path(__file__).parent.parent / "fixtures"


def test_exposure_in_unit_range() -> None:
    s = exposure_score(str(FIX / "sharp.jpg"))
    assert 0.0 <= s <= 1.0


def test_exposure_missing_file_raises() -> None:
    import pytest

    with pytest.raises(FileNotFoundError):
        exposure_score("/nonexistent.jpg")
```

Run — should fail then pass after creating exposure.py.

- [ ] **Step 3: Register `/exposure` route in `app.py`**

```python
from server.exposure import exposure_score


class ExposureRequest(BaseModel):
    path: str


# inside build_app() after /faces:

    @app.post("/exposure")
    async def exposure(req: ExposureRequest) -> dict[str, float]:
        try:
            return {"exposure": exposure_score(req.path)}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
```

- [ ] **Step 4: Run all tests + commit**

```bash
uv run pytest -q
```

Expected: 16 passed.

```bash
cd /Users/meigo/Projects/slop/slop-family-album
git add -A
git commit -m "Python sidecar /exposure endpoint"
```

---

## Phase 2B.4 — TS integration

### Task 8: Extend py-client.ts with new endpoint wrappers

- [ ] **Step 1: Update `src/lib/sidecar/py-client.ts`**

Replace the existing file (preserve all current exports, add new ones):

```ts
import { invoke } from '@tauri-apps/api/core';

let _port: number | null = null;

export async function pySidecarPort(): Promise<number> {
  if (_port !== null) return _port;
  for (let i = 0; i < 120; i++) {
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

export interface PyFaceWithEmbed extends PyFaceBox {
  embedding_b64: string;
  quality: number;
}

export async function blurViaPy(path: string): Promise<number> {
  const r = await pyFetch<{ blur: number }>('/blur', { path });
  return r.blur;
}

export async function phashViaPy(path: string): Promise<string> {
  const r = await pyFetch<{ phash: string }>('/phash', { path });
  return r.phash;
}

export async function facesViaPy(path: string, withEmbeddings = false): Promise<{ count: number; faces: PyFaceBox[] | PyFaceWithEmbed[] }> {
  return pyFetch<{ count: number; faces: PyFaceBox[] | PyFaceWithEmbed[] }>(
    '/faces',
    { path, with_embeddings: withEmbeddings }
  );
}

export async function embedViaPy(path: string): Promise<{ model: string; vector: Uint8Array }> {
  const r = await pyFetch<{ model: string; vector_b64: string }>('/embed', { path });
  return { model: r.model, vector: base64ToBytes(r.vector_b64) };
}

export async function tagsViaPy(path: string, topK = 5): Promise<Array<{ tag: string; score: number }>> {
  const r = await pyFetch<{ tags: Array<{ tag: string; score: number }> }>('/tags', { path, top_k: topK });
  return r.tags;
}

export async function exposureViaPy(path: string): Promise<number> {
  const r = await pyFetch<{ exposure: number }>('/exposure', { path });
  return r.exposure;
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
```

Important: the scanner.ts in Phase 2a called `facesViaPy(path)` expecting a `{ count, boxes }` shape. Now the response is `{ count, faces }`. Task 9 (scanner) needs updating; the existing code will fail until then.

- [ ] **Step 2: Build verification**

```bash
npm run build
```

Will fail because `scanner.ts` consumes the old `boxes` shape. That's expected — Task 9 fixes it. Do not commit yet; combine with Task 9.

### Task 9: Extend `scanner.ts` with new CV calls + face row writes

- [ ] **Step 1: Update `src/lib/indexing/scanner.ts`** to call all new endpoints

The CV pass now does: blur + phash + faces(with_embeddings=true) + embed + tags + exposure per photo, plus writes face rows to the `face` table.

Full replacement (preserve walking + indexing pass; add new imports + CV pass body):

```ts
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import {
  upsertPhoto, getProject, listIndexedAtByPath,
  upsertCvScore, listCvComputedAtByPhotoId, listPhotos,
  clearCvScores, clearFacesForPhoto, insertFace,
  upsertImageEmbedding, listImageEmbeddingsComputedAt, replacePhotoTags,
} from '$lib/db';
import { readExifViaSidecar, makeThumbViaSidecar } from '$lib/sidecar/client';
import {
  blurViaPy, phashViaPy, facesViaPy, embedViaPy, tagsViaPy, exposureViaPy,
  base64ToBytes, type PyFaceWithEmbed,
} from '$lib/sidecar/py-client';
import { indexProgress } from './progress';
import { detectDuplicates } from './dedup';
import { clusterFaces } from './face-clustering';

interface ScannedFile { path: string; size: number; modified: number; }

export async function indexProject(
  projectId: number,
  opts?: { forceCv?: boolean }
): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  indexProgress.set({ phase: 'walking', scanned: 0, total: 0, current: project.source_dir, errors: [], projectId });
  const files = await invoke<ScannedFile[]>('walk_image_dir', { dir: project.source_dir });
  const total = files.length;

  const lastIndexedByPath = await listIndexedAtByPath(projectId);

  const appDir = await appDataDir();
  const thumbDir = await join(appDir, 'projects', String(projectId), 'thumbs');

  indexProgress.update((p) => ({ ...p, phase: 'indexing', total }));

  // ---- INDEXING PASS (unchanged) ----
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    indexProgress.update((p) => ({ ...p, scanned: i, current: f.path }));
    const prev = lastIndexedByPath.get(f.path);
    if (prev !== undefined && prev >= f.modified * 1000) continue;
    try {
      const sha256 = await invoke<string>('hash_file', { path: f.path });
      const exif = await readExifViaSidecar(f.path);
      const thumbPath = await join(thumbDir, `${sha256}.jpg`);
      await makeThumbViaSidecar(f.path, thumbPath, 256);
      await upsertPhoto({
        project_id: projectId, path: f.path, sha256,
        taken_at: exif.taken_at ? Date.parse(exif.taken_at) : (f.modified * 1000),
        width: exif.width, height: exif.height, orientation: exif.orientation,
        exif_json: exif.exif_json, thumb_path: thumbPath, indexed_at: Date.now(),
      });
    } catch (err) {
      indexProgress.update((p) => ({ ...p, errors: [...p.errors, `${f.path}: ${err}`] }));
    }
  }

  // ---- CV PASS ----
  indexProgress.update((p) => ({ ...p, phase: 'indexing', current: 'running CV pass…' }));
  if (opts?.forceCv) {
    await clearCvScores(projectId);
  }
  const photos = await listPhotos(projectId);
  const cvComputed = await listCvComputedAtByPhotoId(projectId);
  const embComputed = await listImageEmbeddingsComputedAt(projectId);

  for (let i = 0; i < photos.length; i++) {
    const ph = photos[i];
    indexProgress.update((p) => ({ ...p, scanned: i, total: photos.length, current: `cv: ${ph.path}` }));

    const lastCv = cvComputed.get(ph.id);
    const lastEmb = embComputed.get(ph.id);
    const cvFresh = lastCv !== undefined && lastCv >= ph.indexed_at;
    const embFresh = lastEmb !== undefined && lastEmb >= ph.indexed_at;
    if (cvFresh && embFresh) continue;

    try {
      // Phase 2a signals (blur, phash, faces with embeddings, exposure)
      const [blur, phash, facesResult, exposure] = await Promise.all([
        blurViaPy(ph.path),
        phashViaPy(ph.path),
        facesViaPy(ph.path, /*withEmbeddings=*/ true),
        exposureViaPy(ph.path),
      ]);

      // Re-write face rows: clear existing, insert new
      await clearFacesForPhoto(ph.id);
      const facesWithEmb = facesResult.faces as PyFaceWithEmbed[];
      for (const fb of facesWithEmb) {
        await insertFace({
          photo_id: ph.id,
          bbox_x: fb.x, bbox_y: fb.y, bbox_w: fb.w, bbox_h: fb.h,
          embedding: base64ToBytes(fb.embedding_b64),
          quality: fb.quality,
          computed_at: Date.now(),
        });
      }

      // cv_score upsert (keep faces_json as a denormalized cache for the UI)
      await upsertCvScore({
        photo_id: ph.id,
        blur,
        faces_count: facesResult.count,
        faces_json: JSON.stringify(facesWithEmb.map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h }))),
        phash,
        computed_at: Date.now(),
      });

      // exposure goes on cv_score too (added by migration 003)
      const d = await (await import('$lib/db')).db();
      await d.execute('UPDATE cv_score SET exposure = ? WHERE photo_id = ?', [exposure, ph.id]);

      // Phase 2b signals: embedding + tags
      const emb = await embedViaPy(ph.path);
      await upsertImageEmbedding({
        photo_id: ph.id, model: emb.model, vector: emb.vector, computed_at: Date.now(),
      });
      const tags = await tagsViaPy(ph.path, 5);
      await replacePhotoTags(ph.id, tags);
    } catch (err) {
      indexProgress.update((p) => ({ ...p, errors: [...p.errors, `cv ${ph.path}: ${err}`] }));
    }
  }

  // ---- DEDUP PASS ----
  indexProgress.update((p) => ({ ...p, current: 'detecting duplicates…' }));
  await detectDuplicates(projectId);

  // ---- FACE CLUSTERING PASS ----
  indexProgress.update((p) => ({ ...p, current: 'clustering faces…' }));
  await clusterFaces(projectId);

  indexProgress.update((p) => ({ ...p, phase: 'done', scanned: total }));
}
```

- [ ] **Step 2: Skip build check — clusterFaces doesn't exist yet (Task 10). Don't commit.**

The build will fail until Task 10 lands `face-clustering.ts`. Defer commit.

### Task 10: Face clustering (greedy DBSCAN)

- [ ] **Step 1: Write `src/lib/indexing/face-clustering.ts`**

```ts
import {
  listFacesByProject, setFaceCluster, clearPersonClusters, insertPersonCluster,
} from '$lib/db';
import type { FaceRow } from '$lib/db/types';

// SFace cosine-similarity threshold for "same person". 0.363 is the
// commonly cited cutoff in OpenCV's docs; we use 0.4 (slightly stricter)
// to bias toward fewer false merges. Tune in Phase 2c.
const COSINE_THRESHOLD = 0.4;

function decodeEmbedding(blob: Uint8Array): Float32Array {
  // Embeddings are stored as float32 little-endian
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;  // embeddings are L2-normalized, so dot product == cosine
}

/** Greedy clustering: each face joins the first existing cluster whose
 *  centroid is within COSINE_THRESHOLD. New clusters are seeded with
 *  faces above a minimum quality threshold (avoids tiny / low-quality
 *  faces seeding spurious clusters).
 *
 *  This is intentionally simple — Phase 2c may upgrade to a proper
 *  DBSCAN or HDBSCAN if quality demands.
 */
export async function clusterFaces(projectId: number): Promise<void> {
  // Reset cluster assignments: drop all clusters, ON DELETE SET NULL
  // empties face.cluster_id automatically.
  await clearPersonClusters(projectId);

  const faces = await listFacesByProject(projectId);
  if (faces.length === 0) return;

  // Decode embeddings once.
  const decoded = faces.map((f) => ({
    face: f,
    vec: decodeEmbedding(new Uint8Array(f.embedding)),
  }));

  // Sort by descending quality so high-quality faces seed clusters first.
  decoded.sort((a, b) => (b.face.quality ?? 0) - (a.face.quality ?? 0));

  interface Cluster {
    id: number;            // person_cluster.id
    centroid: Float32Array;
    memberFaceIds: number[];
  }
  const clusters: Cluster[] = [];

  for (const { face, vec } of decoded) {
    let joined: Cluster | null = null;
    for (const c of clusters) {
      if (cosine(vec, c.centroid) >= COSINE_THRESHOLD) {
        joined = c;
        break;
      }
    }
    if (joined) {
      joined.memberFaceIds.push(face.id);
      // Update centroid as running mean
      const n = joined.memberFaceIds.length;
      const newCentroid = new Float32Array(joined.centroid.length);
      for (let i = 0; i < joined.centroid.length; i++) {
        newCentroid[i] = (joined.centroid[i] * (n - 1) + vec[i]) / n;
      }
      // Re-normalize centroid for next cosine comparison
      let norm = 0;
      for (let i = 0; i < newCentroid.length; i++) norm += newCentroid[i] * newCentroid[i];
      norm = Math.sqrt(norm);
      if (norm > 0) for (let i = 0; i < newCentroid.length; i++) newCentroid[i] /= norm;
      joined.centroid = newCentroid;
      await setFaceCluster(face.id, joined.id);
    } else {
      // Skip seeding clusters from low-quality faces; they'll stay unclustered.
      if ((face.quality ?? 0) < 0.1) continue;
      const newId = await insertPersonCluster(projectId);
      clusters.push({
        id: newId,
        centroid: new Float32Array(vec),
        memberFaceIds: [face.id],
      });
      await setFaceCluster(face.id, newId);
    }
  }
}
```

- [ ] **Step 2: Build verification**

```bash
npm run build
```

Should now succeed.

- [ ] **Step 3: Commit (combine scanner + clustering)**

```bash
git add src/lib/indexing/scanner.ts src/lib/indexing/face-clustering.ts src/lib/sidecar/py-client.ts
git commit -m "Phase 2b CV pass: embeddings, tags, face embeddings, clustering"
```

---

## Phase 2B.5 — UI: People page

### Task 11: People page (review + name clusters)

- [ ] **Step 1: Create `src/routes/projects/[id]/people/+page.ts`**

```ts
import {
  getProject, listPersonClusters, listFacesByProject, listPhotos,
} from '$lib/db';
import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export async function load({ params }) {
  const id = Number(params.id);
  const project = await getProject(id);
  if (!project) throw error(404, 'Project not found');
  const clusters = await listPersonClusters(id);
  const faces = await listFacesByProject(id);
  const photos = await listPhotos(id);
  const photoById = new Map(photos.map((p) => [p.id, p]));

  // Group faces by cluster_id
  const facesByCluster = new Map<number | null, typeof faces>();
  for (const f of faces) {
    const key = f.cluster_id;
    if (!facesByCluster.has(key)) facesByCluster.set(key, []);
    facesByCluster.get(key)!.push(f);
  }

  return { project, clusters, facesByCluster, photoById };
}
```

- [ ] **Step 2: Create `src/routes/projects/[id]/people/+page.svelte`**

```svelte
<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { updatePersonCluster } from '$lib/db';
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();

  async function rename(id: number, name: string) {
    await updatePersonCluster(id, { name: name.trim() || null });
    await invalidateAll();
  }

  async function togglePin(id: number, current: number) {
    await updatePersonCluster(id, { is_pinned: !current });
    await invalidateAll();
  }
</script>

<div class="container-page" style="max-width: 1000px;">
  <PageHeader backHref={`/projects/${data.project.id}`}>
    <h1 class="text-xl font-medium">{data.project.name} — people</h1>
  </PageHeader>

  <p class="text-sm mt-2" style="color: var(--color-muted)">
    {data.clusters.length} clusters · {[...data.facesByCluster.values()].reduce((a, b) => a + b.length, 0)} faces total
  </p>

  <div class="flex flex-col gap-4 mt-4">
    {#each data.clusters as cluster}
      {@const cFaces = data.facesByCluster.get(cluster.id) ?? []}
      <section class="surface-card">
        <div class="flex items-center justify-between gap-2 mb-2">
          <input
            class="input-base flex-1"
            placeholder="Unnamed person"
            value={cluster.name ?? ''}
            onchange={(e) => rename(cluster.id, e.currentTarget.value)}
          />
          <button
            type="button"
            class={cluster.is_pinned ? 'btn-primary' : 'btn-secondary'}
            onclick={() => togglePin(cluster.id, cluster.is_pinned)}
            title="Pinned clusters are always included in album/calendar selection (Phase 3)"
          >
            {cluster.is_pinned ? 'Pinned' : 'Pin'}
          </button>
        </div>
        <p class="text-xs" style="color: var(--color-muted)">{cFaces.length} faces</p>
        <div class="grid grid-cols-8 gap-1 mt-2">
          {#each cFaces.slice(0, 16) as f}
            {@const photo = data.photoById.get(f.photo_id)}
            {#if photo?.thumb_path}
              <img
                src={convertFileSrc(photo.thumb_path)}
                alt=""
                class="w-full aspect-square object-cover rounded"
                title={photo.path}
              />
            {/if}
          {/each}
        </div>
        {#if cFaces.length > 16}
          <p class="text-xs mt-1" style="color: var(--color-muted)">…and {cFaces.length - 16} more</p>
        {/if}
      </section>
    {/each}
    {#if data.clusters.length === 0}
      <p style="color: var(--color-muted)">No clusters yet. Run "Re-run CV" from the project dashboard.</p>
    {/if}
  </div>
</div>
```

- [ ] **Step 3: Add a link to the People page from the dashboard**

In `src/routes/projects/[id]/+page.svelte`, add a `<a class="btn-secondary" href={`/projects/${data.project.id}/people`}>People</a>` next to "Open library".

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add -A
git commit -m "People page: review + name face clusters, pin must-include"
```

### Task 12: Library grid surfaces top tag

- [ ] **Step 1: Update `src/routes/projects/[id]/library/+page.ts`**

Add `listTopTagByPhoto(id)` to the loader return.

- [ ] **Step 2: Update `src/routes/projects/[id]/library/+page.svelte`**

In the per-photo overlay (alongside blur badge / face count / dup badge), add a small tag chip showing the top tag if its score exceeds 0.3 (avoid noise from low-confidence predictions):

```svelte
{@const top = data.topTagByPhoto.get(photo.id)}
{#if top && top.score > 0.3}
  <span class="text-xs px-1 rounded" style="background: var(--color-surface); color: var(--color-muted); border: 1px solid var(--color-line)" title="confidence: {(top.score * 100).toFixed(0)}%">
    {top.tag}
  </span>
{/if}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add -A
git commit -m "Library grid: surface top scene tag per photo"
```

---

## Phase 2B.6 — Close-out

### Task 13: README + Phase 2b tag

- [ ] **Step 1: Update `README.md`**

Replace the Status section with:

```markdown
## Status

**Phase 1 (Foundation) — complete.** App indexes a folder into SQLite with thumbnails + EXIF and shows the library as a grid.

**Phase 2a (CV pipeline) — complete.** Python sidecar runs blur + face detection + perceptual hash on every indexed photo. Duplicate groups are detected via pHash Hamming distance.

**Phase 2b (Semantic CV) — complete.** Image embeddings (OpenCLIP ViT-B/32), zero-shot scene tags, per-face embeddings (SFace), face clustering, and exposure scoring. People page lets you name face clusters and pin "must-include" ones. Library grid shows the top scene tag per photo.

Phase 3 (selection + layout) and Phase 4 (PDF export + LLM captions) are planned but not yet implemented.
```

Update the Development section to note that first `npm run tauri dev` will download ~150 MB of OpenCLIP weights to `~/.cache/torch/hub/checkpoints/`.

- [ ] **Step 2: Verify plan + spec are in `docs/superpowers/`**

If the Phase 2b plan isn't already copied into the repo, copy it from slop-ideas. (Earlier sessions established the convention.)

- [ ] **Step 3: Final commit + tag + push**

```bash
git add -A
git commit -m "Phase 2b close-out: README, plan copy"
git tag phase-2b-semantic-cv
git push origin main
git push origin phase-2b-semantic-cv
```

---

## Phase 2b Definition of Done

- [ ] Migration 003 runs cleanly on existing Phase 2a databases.
- [ ] Sidecar tests all pass (~16+ pytest).
- [ ] Indexing a folder now writes: `cv_score` rows (with exposure column), `image_embedding` rows, `photo_tag` rows, `face` rows (with embeddings), `person_cluster` rows.
- [ ] Re-running "Index now" or "Re-run CV" skips already-computed embeddings + face rows (cached by computed_at).
- [ ] The People page shows clusters, allows renaming, allows pin-toggle.
- [ ] The library grid surfaces the top scene tag per photo.
- [ ] `npm run tauri dev` launches and spawns both sidecars; CV pass completes end-to-end on a real folder.
- [ ] All existing automated tests still pass (Rust, Node sidecar, Playwright).
- [ ] No photo data leaves the machine.

---

## Out of Phase 2b

- Aggregate per-photo `score` table with constraint-driven weights — **Phase 3**
- Album / calendar selection algorithms — **Phase 3**
- Layout engine + page templates — **Phase 3**
- "Find similar photos to this one" UI — **Phase 3 or 4**
- PDF export — **Phase 4**
- Ollama / Claude captioning — **Phase 4**
- Cluster merge / split UI (manual re-clustering) — **Phase 2c if user demand**
- Better face detector (InsightFace, larger SFace model) — **Phase 2c if YuNet/SFace accuracy is insufficient**
- Production sidecar bundling (still dev-mode only) — **Phase 4**
- i18n — see cross-cutting note in `VETTED.md`
