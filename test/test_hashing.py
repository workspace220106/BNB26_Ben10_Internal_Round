"""Standalone tests for the hashing module (no chain dependency)."""
from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sdk"))

from modelledger.hashing import compute_hashes, hamming_bytes


def _png(color=(10, 200, 50), size=(256, 256), seed=0) -> bytes:
    import random
    r = random.Random(seed)
    img = Image.new("RGB", size, color)
    # pHash/dHash intentionally ignore uniform fills — paint structure.
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    for _ in range(20):
        x1, y1 = r.randint(0, size[0] - 1), r.randint(0, size[1] - 1)
        x2, y2 = r.randint(0, size[0] - 1), r.randint(0, size[1] - 1)
        d.rectangle([min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)],
                    outline=(0, 0, 0), width=2)
    buf = io.BytesIO(); img.save(buf, "PNG"); return buf.getvalue()


def test_hash_sizes():
    h = compute_hashes(_png())
    assert len(h.sha256) == 32
    assert len(h.phash) == 32
    assert len(h.dhash) == 32
    assert len(h.clip) == 32


def test_sha_breaks_on_reencode_but_phash_survives():
    raw = _png()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=85)
    recoded = buf.getvalue()
    a, b = compute_hashes(raw), compute_hashes(recoded)
    assert a.sha256 != b.sha256
    # perceptual hash should be very close (Hamming distance small)
    assert hamming_bytes(a.phash, b.phash) <= 6


def test_phash_differs_for_different_images():
    a = compute_hashes(_png(color=(255, 0, 0), seed=1))
    b = compute_hashes(_png(color=(0, 0, 255), seed=99))
    assert hamming_bytes(a.phash, b.phash) > 0 or hamming_bytes(a.dhash, b.dhash) > 0
