"""
Verifier — the consumer-side logic.

Walks the on-chain DAG for a given artifact, scores every candidate match by
hash agreement + operator reputation + chain completeness, and emits a
`VerifierReport` with a verdict and the full lineage.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Union

from .chain import Chain, Verdict, OpType
from .hashing import ArtifactHashes, compute_hashes, hamming_bytes

# Max hamming distances considered "same artifact" for soft-bound hashes.
PHASH_SOFT_THRESHOLD = 10      # out of 64 bits
CLIP_SOFT_THRESHOLD = 48       # out of 256 bits (coarse bucket)


@dataclass
class ChainNode:
    att_id: str
    op_type: str
    model_did_hash: str
    manifest_uri: str
    timestamp: int
    revoked: bool
    sha_match: str                 # 'exact' | 'none'
    phash_distance: int
    clip_distance: int
    parents: list[str] = field(default_factory=list)


@dataclass
class VerifierReport:
    artifact_sha256: str
    artifact_phash: str
    verdict: str
    chosen_attestation: str | None
    lineage: list[ChainNode]
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


@dataclass
class Verifier:
    chain: Chain
    min_reputation: int = 1
    min_stake_wei: int = 10_000_000_000_000_000  # 0.01 BNB
    allow_revoked: bool = False

    def verify(self, artifact: Union[str, Path, bytes]) -> VerifierReport:
        hashes = compute_hashes(artifact)
        candidates = self._gather_candidates(hashes)

        notes: list[str] = []
        if not candidates:
            return VerifierReport(
                artifact_sha256="0x" + hashes.sha256.hex(),
                artifact_phash="0x" + hashes.phash.hex(),
                verdict=Verdict.UNVERIFIABLE.name,
                chosen_attestation=None,
                lineage=[],
                notes=["no attestation matches sha256, phash, or clip hash"],
            )

        verdict, chosen = self.chain.classify(
            list(candidates), self.min_reputation, self.min_stake_wei, self.allow_revoked
        )

        lineage: list[ChainNode] = []
        if chosen != b"\x00" * 32:
            lineage = self._walk_ancestors(chosen, hashes)
        else:
            # Policy returned no "chosen" (UNVERIFIABLE / CONFLICTING) but we
            # still want to show what we found.
            for cid in candidates:
                lineage.append(self._node(cid, hashes))
            if verdict == Verdict.CONFLICTING:
                notes.append("multiple GENERATION attestations target the same artifact")

        return VerifierReport(
            artifact_sha256="0x" + hashes.sha256.hex(),
            artifact_phash="0x" + hashes.phash.hex(),
            verdict=verdict.name,
            chosen_attestation=("0x" + chosen.hex()) if chosen != b"\x00" * 32 else None,
            lineage=lineage,
            notes=notes,
        )

    # ------------- internals -------------

    def _gather_candidates(self, h: ArtifactHashes) -> list[bytes]:
        """Collect attestation ids whose stored hashes match the artifact.

        Exact sha wins; otherwise fall back to perceptual + CLIP within
        tolerance. We dedupe while preserving order.
        """
        seen: dict[bytes, None] = {}

        def add(ids: list[bytes]) -> None:
            for i in ids:
                if i not in seen:
                    seen[i] = None

        add(self.chain.find_by_sha(h.sha256))
        if not seen:
            # Soft lookup: scan everything hashed by phash bucket.
            # For a prod system you'd keep a locality-sensitive index. For the
            # hackathon we rely on exact phash first, then test every unique
            # phash key seen on-chain via events. Here we start simple:
            add(self.chain.find_by_phash(h.phash))
        if not seen:
            add(self.chain.find_by_clip(h.clip))

        return list(seen.keys())

    def _walk_ancestors(self, root: bytes, art: ArtifactHashes) -> list[ChainNode]:
        lineage: list[ChainNode] = []
        visited: set[bytes] = set()
        frontier: list[bytes] = [root]
        while frontier:
            att_id = frontier.pop(0)
            if att_id in visited:
                continue
            visited.add(att_id)
            node = self._node(att_id, art)
            lineage.append(node)
            parents = self.chain.parents_of(att_id)
            node.parents = ["0x" + p.hex() for p in parents]
            frontier.extend(parents)
        return lineage

    def _node(self, att_id: bytes, art: ArtifactHashes) -> ChainNode:
        a = self.chain.get_attestation(att_id)
        sha_match = "exact" if bytes(a["sha256Hash"]) == art.sha256 else "none"
        return ChainNode(
            att_id="0x" + att_id.hex(),
            op_type=OpType(a["opType"]).name,
            model_did_hash="0x" + bytes(a["modelId"]).hex(),
            manifest_uri=a["manifestURI"],
            timestamp=int(a["timestamp"]),
            revoked=bool(a["revoked"]),
            sha_match=sha_match,
            phash_distance=hamming_bytes(bytes(a["pHash"]), art.phash),
            clip_distance=hamming_bytes(bytes(a["clipHash"]), art.clip),
        )
