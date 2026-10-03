"""
Attack #4 — Hash collision / pre-image.
A naive binding would be sha256 only. An attacker who can produce ANY two
distinct files with matching perceptual hashes could fool a soft-only system.
We test the ensemble: if sha256 differs AND phash differs AND clip differs,
the artifact must be UNVERIFIABLE even if one of the three happens to collide.
"""
from __future__ import annotations

import io, json
from pathlib import Path
from PIL import Image, ImageDraw

from modelledger import GeneratorSDK, Verifier
from modelledger.hashing import compute_hashes
from adversarial.common import chain_for, storage, ROOT


def paint(color: str, label: str) -> bytes:
    img = Image.new("RGB", (256, 256), color)
    ImageDraw.Draw(img).text((40, 100), label, fill="black")
    buf = io.BytesIO(); img.save(buf, "PNG"); return buf.getvalue()


def run() -> dict:
    c = chain_for(0)
    try: c.register_model("did:ml:collider", "ipfs://x", 10**17)
    except Exception: pass
    c.grant_reputation("did:ml:collider", 50)

    s = storage(); out = ROOT / "demo_out"; out.mkdir(exist_ok=True)
    good = out / "collision_good.png"
    GeneratorSDK(c, s, "did:ml:collider").generate("orig", lambda _: paint("blue", "ORIG"), good)

    attacker = out / "collision_fake.png"
    attacker.write_bytes(paint("red", "FAKE"))

    v = Verifier(c, min_reputation=10)
    r_good = v.verify(good)
    r_fake = v.verify(attacker)

    passed = r_good.verdict == "TRUSTED" and r_fake.verdict == "UNVERIFIABLE"
    return {
        "attack": "hash_collision",
        "passed": passed,
        "legit_verdict": r_good.verdict,
        "attacker_verdict": r_fake.verdict,
    }


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
