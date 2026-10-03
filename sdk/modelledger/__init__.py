"""ModelLedger SDK — provenance for AI-generated content.

Heavier submodules (chain, generator, transformer, verifier) are imported
lazily so that tooling can use `modelledger.hashing` without pulling in web3.
"""
from .hashing import ArtifactHashes, compute_hashes, hamming_bytes


def __getattr__(name):
    if name in {"Chain", "OpType", "Verdict"}:
        from . import chain as _c
        return getattr(_c, name)
    if name == "GeneratorSDK":
        from .generator import GeneratorSDK
        return GeneratorSDK
    if name == "TransformerSDK":
        from .transformer import TransformerSDK
        return TransformerSDK
    if name in {"Verifier", "VerifierReport"}:
        from . import verifier as _v
        return getattr(_v, name)
    if name in {"LocalStorage", "Storage"}:
        from . import storage as _s
        return getattr(_s, name)
    raise AttributeError(name)


__all__ = [
    "ArtifactHashes", "compute_hashes", "hamming_bytes",
    "Chain", "OpType", "Verdict",
    "GeneratorSDK", "TransformerSDK",
    "Verifier", "VerifierReport",
    "LocalStorage", "Storage",
]
