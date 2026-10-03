"""
End-to-end demo:

1. register two models (SDXL + an upscaler) with stake
2. GENERATION: 'SDXL' produces an image (synthetic, deterministic)
3. TRANSFORMATION: 'upscaler' processes the image, chains to generation
4. verify both artifacts and print verdicts

Run after `hardhat node` + `npx hardhat run scripts/deploy.ts --network localhost`.
"""
from __future__ import annotations

import io
import json
import os
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sdk"))

from modelledger import (                                   # noqa: E402
    Chain, GeneratorSDK, TransformerSDK, Verifier, LocalStorage, OpType,
)

RPC = os.getenv("MODELLEDGER_RPC", "http://127.0.0.1:8545")
# hardhat default signer #0
KEY_OWNER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
# hardhat default signer #1 (upscaler operator)
KEY_UPSCALER = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"


def fake_sdxl(prompt: str) -> bytes:
    """Deterministic 'generator' — paints the prompt onto a coloured canvas."""
    random.seed(prompt)
    bg = (random.randint(40, 220), random.randint(40, 220), random.randint(40, 220))
    img = Image.new("RGB", (512, 512), bg)
    d = ImageDraw.Draw(img)
    for _ in range(40):
        x1, y1 = random.randint(0, 511), random.randint(0, 511)
        x2, y2 = random.randint(0, 511), random.randint(0, 511)
        d.rectangle([min(x1,x2), min(y1,y2), max(x1,x2), max(y1,y2)],
                    outline=(0, 0, 0), width=2)
    d.text((20, 20), prompt[:40], fill=(255, 255, 255))
    buf = io.BytesIO(); img.save(buf, "PNG"); return buf.getvalue()


def fake_upscaler(inputs: list[bytes]) -> bytes:
    img = Image.open(io.BytesIO(inputs[0])).convert("RGB").resize((1024, 1024), Image.LANCZOS)
    buf = io.BytesIO(); img.save(buf, "PNG"); return buf.getvalue()


def main() -> None:
    outdir = ROOT / "demo_out"
    outdir.mkdir(exist_ok=True)
    storage = LocalStorage(ROOT / "manifests")

    chain_owner = Chain.connect(RPC, KEY_OWNER, ROOT)
    chain_up = Chain.connect(RPC, KEY_UPSCALER, ROOT)

    # 1. register models
    for c, did in [(chain_owner, "did:ml:sdxl-1.0"), (chain_up, "did:ml:realesrgan-1.0")]:
        try:
            c.register_model(did, "ipfs://card/" + did, 10**17)
            print(f"[register] {did}")
        except Exception as e:
            print(f"[register] {did} already present ({e.__class__.__name__})")
    chain_owner.grant_reputation("did:ml:sdxl-1.0", 50)
    chain_owner.grant_reputation("did:ml:realesrgan-1.0", 30)

    # 2. generation
    gen = GeneratorSDK(chain_owner, storage, "did:ml:sdxl-1.0")
    gen_path = outdir / "fox.png"
    gen_att = gen.generate(prompt="a red fox in a forest, cinematic", generate_fn=fake_sdxl, out_path=gen_path)
    print(f"[gen] attestation {gen_att.hex()[:12]}… for {gen_path.name}")

    # 3. transformation (upscaler)
    tr = TransformerSDK(chain_up, storage, "did:ml:realesrgan-1.0")
    up_path = outdir / "fox_4x.png"
    up_att = tr.transform([gen_path], fake_upscaler, up_path,
                          op_description="upscale 2x LANCZOS")
    print(f"[tr ] attestation {up_att.hex()[:12]}… for {up_path.name}")

    # 4. verify both artifacts
    v = Verifier(chain_owner, min_reputation=10)
    for p in [gen_path, up_path]:
        rep = v.verify(p)
        print(f"\n==== VERIFY {p.name} ====")
        print(json.dumps(rep.to_dict(), indent=2))


if __name__ == "__main__":
    main()
