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
