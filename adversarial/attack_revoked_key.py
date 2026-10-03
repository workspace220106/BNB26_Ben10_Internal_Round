"""
Attack #2 — Revoked key.
A model operator revokes its registration (simulating key compromise). An
artifact attested BEFORE revocation should fall back to SELF_ASSERTED under
the default policy (allow_revoked=False), not TRUSTED. With allow_revoked=True
it should still be TRUSTED (historical trust).
"""
from __future__ import annotations

import io, json
from pathlib import Path
from PIL import Image, ImageDraw

from modelledger import GeneratorSDK, Verifier
from adversarial.common import chain_for, storage, ROOT


def paint() -> bytes:
    img = Image.new("RGB", (256, 256), "lightblue")
    ImageDraw.Draw(img).text((40, 100), "revoke-test", fill="black")
    buf = io.BytesIO(); img.save(buf, "PNG"); return buf.getvalue()


def run() -> dict:
    c = chain_for(3)
    try: c.register_model("did:ml:compromised", "ipfs://x", 10**17)
    except Exception: pass
    chain_for(0).grant_reputation("did:ml:compromised", 60)

    s = storage(); out = ROOT / "demo_out"; out.mkdir(exist_ok=True)
    p = out / "revoked.png"
    GeneratorSDK(c, s, "did:ml:compromised").generate("x", lambda _: paint(), p)

    c.revoke_model("did:ml:compromised", "simulated key leak")

    strict = Verifier(c, min_reputation=10, allow_revoked=False).verify(p)
    lax    = Verifier(c, min_reputation=10, allow_revoked=True).verify(p)

    passed = strict.verdict in {"UNVERIFIABLE", "SELF_ASSERTED"} and lax.verdict == "TRUSTED"
    return {
        "attack": "revoked_key",
        "passed": passed,
        "strict_verdict": strict.verdict,
        "lax_verdict": lax.verdict,
    }


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
