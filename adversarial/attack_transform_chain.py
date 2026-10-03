"""
Attack #3 — Legitimate transformation.
A legitimately-generated artifact is JPEG-re-encoded and resized by a
downstream app that does NOT publish an attestation. The verifier should
still find the original attestation via perceptual-hash soft match and
return TRUSTED (or at least SELF_ASSERTED) rather than UNVERIFIABLE.

This is the single most important property for the real world: provenance
must survive routine transformations.
"""
from __future__ import annotations

import io, json
from pathlib import Path

from PIL import Image, ImageDraw

from modelledger import GeneratorSDK, Verifier
from modelledger.hashing import compute_hashes, hamming_bytes
from adversarial.common import chain_for, storage, jpeg_reencode, resize, ROOT


def paint() -> bytes:
    img = Image.new("RGB", (512, 512), "yellow")
    d = ImageDraw.Draw(img)
    for i in range(20): d.ellipse([i*10, i*10, 512-i*10, 512-i*10], outline="red")
    buf = io.BytesIO(); img.save(buf, "PNG"); return buf.getvalue()


def run() -> dict:
    c = chain_for(0)
    try: c.register_model("did:ml:artist-v2", "ipfs://x", 10**17)
    except Exception: pass
    c.grant_reputation("did:ml:artist-v2", 80)

    s = storage(); out = ROOT / "demo_out"; out.mkdir(exist_ok=True)
    orig = out / "transform_src.png"
    GeneratorSDK(c, s, "did:ml:artist-v2").generate("sunburst", lambda _: paint(), orig)

    recoded = jpeg_reencode(orig, quality=70)
    smaller = resize(orig, 0.5)

    orig_h = compute_hashes(orig)
    v = Verifier(c, min_reputation=10)
    results = {}
    for label, p in [("original", orig), ("jpeg_q70", recoded), ("resize_50", smaller)]:
        h = compute_hashes(p)
        rep = v.verify(p)
        results[label] = {
            "verdict": rep.verdict,
            "phash_distance_from_original": hamming_bytes(h.phash, orig_h.phash),
        }

    passed = (
        results["original"]["verdict"] == "TRUSTED" and
        results["jpeg_q70"]["verdict"] in {"TRUSTED", "SELF_ASSERTED"} and
        results["resize_50"]["verdict"] in {"TRUSTED", "SELF_ASSERTED"}
    )
    return {"attack": "transform_chain", "passed": passed, "results": results}


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
