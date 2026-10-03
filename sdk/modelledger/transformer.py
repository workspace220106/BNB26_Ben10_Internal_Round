"""
TransformerSDK — attests edits/upscales/compositions. The transformer
references its parent attestations by id, so the on-chain log forms a DAG
instead of a flat list.
"""
from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from .chain import Chain, OpType
from .hashing import compute_hashes
from .storage import Storage


@dataclass
class TransformerSDK:
    chain: Chain
    storage: Storage
    did: str

    def transform(
        self,
        inputs: list[str | Path],
        transform_fn: Callable[[list[bytes]], bytes],
        out_path: str | Path,
        op_description: str,
        parents: Iterable[bytes] | None = None,
        op_type: OpType = OpType.TRANSFORMATION,
    ) -> bytes:
        in_bytes = [Path(p).read_bytes() for p in inputs]
        out = transform_fn(in_bytes)
        Path(out_path).write_bytes(out)

        # If the caller did not pre-resolve parent attestation ids, look them
        # up from the inputs' sha256 (exact match only — soft lookups are
        # handled by the Verifier side).
        if parents is None:
            parents = []
            for b in in_bytes:
                sha = hashlib.sha256(b).digest().rjust(32, b"\x00")
                ids = self.chain.find_by_sha(sha)
                parents.extend(ids)

        hashes = compute_hashes(out)
        salt = secrets.token_bytes(16)
        op_commit = hashlib.sha256(op_description.encode() + salt).digest()

        manifest = {
            "spec": "modelledger/1",
            "op": "TRANSFORMATION",
            "model_did": self.did,
            "operation": op_description,
            "input_count": len(in_bytes),
            "hashes": hashes.as_hex(),
            "salt": salt.hex(),
        }
        uri = self.storage.put(manifest)

        _tx, att_id = self.chain.post_attestation(
            did=self.did,
            op_type=op_type,
            sha256_=hashes.sha256,
            phash=hashes.phash,
            clip=hashes.clip,
            prompt_commit=op_commit,
            parents=list(parents),
            manifest_uri=uri,
        )
        return att_id
