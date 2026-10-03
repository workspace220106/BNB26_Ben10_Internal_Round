"""
GeneratorSDK — wraps a model inference call so that every output is
attested on-chain.

The actual image generation is left to the caller (so the SDK is model-
agnostic). Typical use:

    def my_model(prompt: str) -> bytes:
        return stable_diffusion(prompt).to_png_bytes()

    sdk = GeneratorSDK(chain, storage, did="did:ml:sdxl-1.0")
    att_id = sdk.generate(prompt="a red fox", generate_fn=my_model, out_path="fox.png")
"""
from __future__ import annotations

import hashlib
import os
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .chain import Chain, OpType
from .hashing import compute_hashes
from .storage import Storage


@dataclass
class GeneratorSDK:
    chain: Chain
    storage: Storage
    did: str

    def generate(
        self,
        prompt: str,
        generate_fn: Callable[[str], bytes],
        out_path: str | Path,
        extra_params: dict | None = None,
    ) -> bytes:
        raw = generate_fn(prompt)
        Path(out_path).write_bytes(raw)

        hashes = compute_hashes(raw)
        salt = secrets.token_bytes(16)
        prompt_commit = hashlib.sha256(prompt.encode() + salt).digest()

        manifest = {
            "spec": "modelledger/1",
            "op": "GENERATION",
            "model_did": self.did,
            "params": extra_params or {},
            "hashes": hashes.as_hex(),
            # Prompt is encrypted-at-rest with a per-attestation salt so the
            # manifest file is reveal-able but useless without the salt.
            "prompt_cipher": _wrap(prompt, salt).hex(),
            "salt": salt.hex(),
        }
        uri = self.storage.put(manifest)

        _tx, att_id = self.chain.post_attestation(
            did=self.did,
            op_type=OpType.GENERATION,
            sha256_=hashes.sha256,
            phash=hashes.phash,
            clip=hashes.clip,
            prompt_commit=prompt_commit,
            parents=[],
            manifest_uri=uri,
        )
        return att_id


def _wrap(prompt: str, salt: bytes) -> bytes:
    """Minimal symmetric wrap (AES-GCM) using salt-derived key.

    Deliberately simple: for a hackathon demo this gives us a reveal-able
    prompt field without any new key management ceremony. For production,
    the key should be an operator-held secret, not derived from the public
    salt.
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = hashlib.sha256(b"modelledger-prompt-key:" + salt).digest()
    return AESGCM(key).encrypt(salt[:12], prompt.encode(), None)


def unwrap(cipher: bytes, salt: bytes) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = hashlib.sha256(b"modelledger-prompt-key:" + salt).digest()
    return AESGCM(key).decrypt(salt[:12], cipher, None).decode()
