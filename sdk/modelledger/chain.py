"""
Thin web3 wrapper for the four contracts. Loads ABIs from Hardhat's artifact
output and resolves addresses from `deployments.json`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path
from typing import Iterable

from eth_account import Account
from web3 import Web3


class OpType(IntEnum):
    GENERATION = 0
    TRANSFORMATION = 1
    COMPOSITION = 2


class Verdict(IntEnum):
    UNVERIFIABLE = 0
    SELF_ASSERTED = 1
    TRUSTED = 2
    CONFLICTING = 3


def _load_abi(repo_root: Path, name: str) -> list:
    """Load an ABI from a Hardhat artifact file."""
    cand = list(repo_root.rglob(f"artifacts/contracts/{name}.sol/{name}.json"))
    if not cand:
        raise FileNotFoundError(
            f"ABI for {name} not found — run `npx hardhat compile` first."
        )
    return json.loads(cand[0].read_text())["abi"]


@dataclass
class Chain:
    rpc_url: str
    private_key: str
    deployments: dict
    repo_root: Path
    w3: Web3 = None  # type: ignore
    acct: Account = None  # type: ignore
    registry = None
    ledger = None
    graph = None
    policy = None

    @classmethod
    def connect(cls, rpc_url: str, private_key: str, repo_root: str | Path) -> "Chain":
        repo_root = Path(repo_root)
        deployments = json.loads((repo_root / "deployments.json").read_text())
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        acct = Account.from_key(private_key)
        c = cls(rpc_url, private_key, deployments, repo_root, w3=w3, acct=acct)
        c.registry = w3.eth.contract(address=deployments["ModelRegistry"], abi=_load_abi(repo_root, "ModelRegistry"))
        c.ledger = w3.eth.contract(address=deployments["AttestationLedger"], abi=_load_abi(repo_root, "AttestationLedger"))
        c.graph = w3.eth.contract(address=deployments["TransformationGraph"], abi=_load_abi(repo_root, "TransformationGraph"))
        c.policy = w3.eth.contract(address=deployments["TrustPolicy"], abi=_load_abi(repo_root, "TrustPolicy"))
        return c

    # ----- registry -----
    def register_model(self, did: str, metadata_uri: str, stake_wei: int) -> str:
        tx = self.registry.functions.register(did, metadata_uri).build_transaction(self._tx(value=stake_wei))
        return self._send(tx)

    def grant_reputation(self, did: str, delta: int) -> str:
        mid = Web3.keccak(text=did)
        tx = self.registry.functions.grantReputation(mid, delta).build_transaction(self._tx())
        return self._send(tx)

    def revoke_model(self, did: str, reason: str) -> str:
        mid = Web3.keccak(text=did)
        tx = self.registry.functions.revoke(mid, reason).build_transaction(self._tx())
        return self._send(tx)

    # ----- ledger -----
    def post_attestation(
        self,
        did: str,
        op_type: OpType,
        sha256_: bytes,
        phash: bytes,
        clip: bytes,
        prompt_commit: bytes,
        parents: Iterable[bytes],
        manifest_uri: str,
    ) -> tuple[str, bytes]:
        mid = Web3.keccak(text=did)
        parents = [p if isinstance(p, (bytes, bytearray)) else bytes.fromhex(p.removeprefix("0x")) for p in parents]
        tx = self.ledger.functions.post(
            mid, int(op_type), sha256_, phash, clip, prompt_commit, parents, manifest_uri
        ).build_transaction(self._tx())
        tx_hash = self._send(tx)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        logs = self.ledger.events.AttestationPosted().process_receipt(receipt)
        att_id = bytes(logs[0]["args"]["id"])
        return tx_hash, att_id

    def find_by_sha(self, h: bytes) -> list[bytes]:
        return [bytes(x) for x in self.ledger.functions.findBySha(h).call()]

    def find_by_phash(self, h: bytes) -> list[bytes]:
        return [bytes(x) for x in self.ledger.functions.findByPhash(h).call()]

    def find_by_clip(self, h: bytes) -> list[bytes]:
        return [bytes(x) for x in self.ledger.functions.findByClip(h).call()]

    def get_attestation(self, att_id: bytes) -> dict:
        a = self.ledger.functions.get(att_id).call()
        keys = ["modelId", "opType", "sha256Hash", "pHash", "clipHash",
                "promptCommit", "parents", "manifestURI", "signer", "timestamp", "revoked"]
        return dict(zip(keys, a))

    def parents_of(self, att_id: bytes) -> list[bytes]:
        return [bytes(x) for x in self.ledger.functions.parentsOf(att_id).call()]

    # ----- policy -----
    def classify(self, ids: list[bytes], min_rep: int, min_stake: int, allow_revoked: bool = False) -> tuple[Verdict, bytes]:
        v, chosen = self.policy.functions.classify(
            ids, (min_rep, min_stake, allow_revoked)
        ).call()
        return Verdict(v), bytes(chosen)

    # ----- helpers -----
    def _tx(self, value: int = 0) -> dict:
        return {
            "from": self.acct.address,
            "nonce": self.w3.eth.get_transaction_count(self.acct.address),
            "gas": 1_200_000,
            "gasPrice": self.w3.eth.gas_price,
            "value": value,
            "chainId": self.w3.eth.chain_id,
        }

    def _send(self, tx: dict) -> str:
        signed = self.acct.sign_transaction(tx)
        raw = getattr(signed, "rawTransaction", None) or getattr(signed, "raw_transaction")
        h = self.w3.eth.send_raw_transaction(raw)
        self.w3.eth.wait_for_transaction_receipt(h)
        return h.hex()
