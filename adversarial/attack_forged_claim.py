"""
Attack #1 — Forged claim.
An attacker registers 'did:ml:evil' and attests over an artifact THEY did not
produce. The verifier should not promote this to TRUSTED unless the attacker
has reputation — and even then, if the real producer also attested, we expect
CONFLICTING.
"""
from __future__ import annotations

import io, json
from pathlib import Path

from PIL import Image, ImageDraw

from modelledger import GeneratorSDK, Verifier, OpType
from adversarial.common import chain_for, storage, ROOT


def paint(txt: str) -> bytes:
    img = Image.new("RGB", (256, 256), "white")
    ImageDraw.Draw(img).text((20, 100), txt, fill="black")
    buf = io.BytesIO(); img.save(buf, "PNG"); return buf.getvalue()


def run() -> dict:
    good = chain_for(0); evil = chain_for(2)
    s = storage(); out = ROOT / "demo_out"; out.mkdir(exist_ok=True)

    for c, did in [(good, "did:ml:honest-v1"), (evil, "did:ml:evil-v1")]:
        try: c.register_model(did, "ipfs://x", 10**17)
        except Exception: pass
    good.grant_reputation("did:ml:honest-v1", 100)
    # evil has 0 reputation.

    gen = GeneratorSDK(good, s, "did:ml:honest-v1")
    p = out / "forged_target.png"
    gen.generate("a cat", lambda _p: paint("cat"), p)

    # Attacker also attests over the same artifact.
    data = p.read_bytes()
    from modelledger.hashing import compute_hashes
    import hashlib, secrets
    h = compute_hashes(data); salt = secrets.token_bytes(16)
    commit = hashlib.sha256(b"i-made-this" + salt).digest()
    uri = s.put({"spec": "modelledger/1", "op": "GENERATION", "model_did": "did:ml:evil-v1",
                 "hashes": h.as_hex(), "salt": salt.hex()})
    evil.post_attestation("did:ml:evil-v1", OpType.GENERATION,
                          h.sha256, h.phash, h.clip, commit, [], uri)

    rep = Verifier(good, min_reputation=10).verify(p)
    passed = rep.verdict == "CONFLICTING"
    return {"attack": "forged_claim", "verdict": rep.verdict, "passed": passed, "report": rep.to_dict()}


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
