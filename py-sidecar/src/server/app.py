"""FastAPI app builder. Routes registered here so tests can import buildServer-equivalent via app fixture."""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server.blur import laplacian_variance
from server.faces import detect_faces
from server.phash import perceptual_hash


class BlurRequest(BaseModel):
    path: str


class PhashRequest(BaseModel):
    path: str


class FacesRequest(BaseModel):
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

    @app.post("/phash")
    async def phash(req: PhashRequest) -> dict[str, str]:
        try:
            return {"phash": perceptual_hash(req.path)}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))

    @app.post("/faces")
    async def faces(req: FacesRequest) -> dict[str, object]:
        try:
            boxes = detect_faces(req.path)
            return {"count": len(boxes), "boxes": boxes}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    return app
