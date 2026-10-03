"""Shared helpers for the adversarial scenarios."""
from __future__ import annotations

import io
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sdk"))

from modelledger import Chain, LocalStorage                   # noqa: E402

RPC = os.getenv("MODELLEDGER_RPC", "http://127.0.0.1:8545")
HARDHAT_KEYS = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",  # 0
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",  # 1
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",  # 2
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",  # 3
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",  # 4
]


def chain_for(key_idx: int) -> Chain:
    return Chain.connect(RPC, HARDHAT_KEYS[key_idx], ROOT)


def storage() -> LocalStorage:
    return LocalStorage(ROOT / "manifests")


def jpeg_reencode(path: Path, quality: int = 80) -> Path:
    img = Image.open(path).convert("RGB")
    out = path.with_suffix(f".q{quality}.jpg")
    img.save(out, "JPEG", quality=quality)
    return out


def resize(path: Path, scale: float) -> Path:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    out = path.with_suffix(f".{int(scale*100)}p.png")
    img.resize((int(w * scale), int(h * scale)), Image.LANCZOS).save(out, "PNG")
    return out
