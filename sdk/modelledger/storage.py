"""
Manifest storage abstraction.

In production this would push manifests to BNB Greenfield (or IPFS). For the
hackathon demo we provide a filesystem-backed implementation addressed by the
sha256 of the manifest body, so the "URI" is content-addressed and stable.

Swap `LocalStorage` for a Greenfield-backed implementation that returns a
`greenfield://bucket/object` URI — the SDK only depends on the `Storage`
protocol.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


class Storage(Protocol):
    def put(self, manifest: dict) -> str: ...
    def get(self, uri: str) -> dict: ...


@dataclass
class LocalStorage:
    root: Path

    def __post_init__(self) -> None:
        self.root = Path(self.root)
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, manifest: dict) -> str:
        body = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
        cid = hashlib.sha256(body).hexdigest()
        (self.root / f"{cid}.json").write_bytes(body)
        return f"local://{cid}"

    def get(self, uri: str) -> dict:
        assert uri.startswith("local://"), f"unknown scheme: {uri}"
        cid = uri[len("local://"):]
        return json.loads((self.root / f"{cid}.json").read_text())
