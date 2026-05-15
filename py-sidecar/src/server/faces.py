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
