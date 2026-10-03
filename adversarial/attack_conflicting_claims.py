"""
Attack #5 — Conflicting generation claims.
Two independent, well-reputed models both claim to be the original producer
of the same artifact. The verifier must surface CONFLICTING rather than
silently picking one.
"""
from __future__ import annotations

import io, json, hashlib, secrets
from pathlib import Path
from PIL import Image, ImageDraw

from modelledger import GeneratorSDK, Verifier, OpType
from modelledger.hashing import compute_hashes
from adversarial.common import chain_for, storage, ROOT


def paint() -> bytes:
    img = Image.new("RGB", (256, 256), "pink")
    ImageDraw.Draw(img).text((20, 100), "conflict", fill="black")
    buf = io.BytesIO(); img.save(buf, "PNG"); return buf.getvalue()


def run() -> dict:
    a = chain_for(0); b = chain_for(1)
    for c, did in [(a, "did:ml:claimant-A"), (b, "did:ml:claimant-B")]:
        try: c.register_model(did, "ipfs://x", 10**17)
        except Exception: pass
    a.grant_reputation("did:ml:claimant-A", 100)
    a.grant_reputation("did:ml:claimant-B", 100)

    s = storage(); out = ROOT / "demo_out"; out.mkdir(exist_ok=True)
    p = out / "conflict.png"
    GeneratorSDK(a, s, "did:ml:claimant-A").generate("x", lambda _: paint(), p)

    data = p.read_bytes(); h = compute_hashes(data); salt = secrets.token_bytes(16)
    commit = hashlib.sha256(b"mine too" + salt).digest()
    uri = s.put({"spec": "modelledger/1", "op": "GENERATION",
                 "model_did": "did:ml:claimant-B", "hashes": h.as_hex(), "salt": salt.hex()})
    b.post_attestation("did:ml:claimant-B", OpType.GENERATION,
                       h.sha256, h.phash, h.clip, commit, [], uri)

    rep = Verifier(a, min_reputation=10).verify(p)
    passed = rep.verdict == "CONFLICTING"
    return {"attack": "conflicting_claims", "passed": passed, "verdict": rep.verdict}


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
