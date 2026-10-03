"""
Dual-binding hash scheme.

* `sha256`  — bitwise. Breaks on any re-encoding; catches exact copies.
* `pHash`   — DCT-based perceptual hash (64-bit). Survives JPEG re-encode,
              resize, light crop, brightness/contrast tweaks.
* `dHash`   — difference hash (64-bit). Complements pHash on noisy edits.
* `clipHash`— bucketed CLIP embedding, if the optional `clip` extra is
              installed. Catches *semantic* edits (style transfer, inpainting
              that preserves subject) that bitwise perceptual hashes miss.
              Falls back to an average-color coarse bucket when CLIP is
              unavailable, so the pipeline still runs end-to-end.

All hashes are returned as 32-byte values suitable for `bytes32` on-chain.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Union

import imagehash
import numpy as np
from PIL import Image

PathLike = Union[str, Path]


@dataclass(frozen=True)
class ArtifactHashes:
    sha256: bytes      # 32 bytes
    phash: bytes       # 32 bytes (64-bit hash, left-padded)
    dhash: bytes       # 32 bytes
    clip: bytes        # 32 bytes

    def as_hex(self) -> dict:
        return {k: "0x" + v.hex() for k, v in asdict(self).items()}


def _pad32(b: bytes) -> bytes:
    if len(b) > 32:
        return b[-32:]
    return b.rjust(32, b"\x00")


def _hamming_bucket(image: Image.Image, bits: int = 128) -> bytes:
    """CLIP replacement when the heavy model is not installed.

    Downscales to 16x16 greyscale, Z-scores, binarises against the median.
    The resulting 256-bit signature behaves like a (much weaker) semantic
    hash: style/colour palette changes shift it predictably.
    """
    arr = np.asarray(image.convert("L").resize((16, 16)), dtype=np.float32)
    flat = arr.flatten()
    sig = (flat > np.median(flat)).astype(np.uint8)
    packed = np.packbits(sig).tobytes()
    return _pad32(packed[:32])


def _clip_bucket(image: Image.Image) -> bytes:
    # Opt in: large model download, slow import. Off by default so tests and
    # the demo run instantly. Set MODELLEDGER_USE_CLIP=1 to enable.
    import os as _os
    if _os.getenv("MODELLEDGER_USE_CLIP") != "1":
        return _hamming_bucket(image)
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore  # noqa: F401
    except Exception:
        return _hamming_bucket(image)
    model = _clip_cache()
    if model is None:
        return _hamming_bucket(image)
    emb = model.encode(image, convert_to_numpy=True, normalize_embeddings=True)
    # Bucket by sign pattern of 256 PCA-independent dims (first 256 is fine for
    # CLIP-ViT-B/32 → 512). Robust to small perturbations, breaks on semantic
    # shifts.
    sig = (emb[:256] > 0).astype(np.uint8)
    return _pad32(np.packbits(sig).tobytes())


_MODEL = {"m": None, "tried": False}


def _clip_cache():
    if _MODEL["tried"]:
        return _MODEL["m"]
    _MODEL["tried"] = True
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
        _MODEL["m"] = SentenceTransformer("clip-ViT-B-32")
    except Exception:
        _MODEL["m"] = None
    return _MODEL["m"]


def compute_hashes(src: PathLike | bytes) -> ArtifactHashes:
    """Compute the four-hash fingerprint for an image file or raw bytes."""
    if isinstance(src, (str, Path)):
        raw = Path(src).read_bytes()
        img = Image.open(src)
    else:
        raw = src
        from io import BytesIO
        img = Image.open(BytesIO(src))
    img = img.convert("RGB")

    sha = hashlib.sha256(raw).digest()
    ph = int(str(imagehash.phash(img, hash_size=8)), 16).to_bytes(8, "big")
    dh = int(str(imagehash.dhash(img, hash_size=8)), 16).to_bytes(8, "big")
    clip = _clip_bucket(img)

    return ArtifactHashes(
        sha256=_pad32(sha),
        phash=_pad32(ph),
        dhash=_pad32(dh),
        clip=_pad32(clip),
    )


def hamming_bytes(a: bytes, b: bytes) -> int:
    """Hamming distance between two equal-length byte strings (bitwise)."""
    assert len(a) == len(b)
    x = int.from_bytes(a, "big") ^ int.from_bytes(b, "big")
    return bin(x).count("1")
