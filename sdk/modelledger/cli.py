"""modelledger CLI."""
from __future__ import annotations

import json
import os
from pathlib import Path

import click

from .chain import Chain, OpType
from .hashing import compute_hashes
from .storage import LocalStorage
from .verifier import Verifier


def _chain(ctx) -> Chain:
    rpc = ctx.obj["rpc"]
    key = ctx.obj["key"]
    root = ctx.obj["root"]
    return Chain.connect(rpc, key, root)


def _storage(ctx) -> LocalStorage:
    return LocalStorage(Path(ctx.obj["root"]) / "manifests")


@click.group()
@click.option("--rpc", default=lambda: os.getenv("MODELLEDGER_RPC", "http://127.0.0.1:8545"))
@click.option("--key", default=lambda: os.getenv("MODELLEDGER_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"))
@click.option("--root", default=lambda: os.getenv("MODELLEDGER_ROOT", "."), type=click.Path())
@click.pass_context
def main(ctx, rpc, key, root):
    """ModelLedger: prove which AI model produced this."""
    ctx.ensure_object(dict)
    ctx.obj.update(rpc=rpc, key=key, root=root)


@main.command()
@click.argument("did")
@click.option("--metadata", default="ipfs://model-card")
@click.option("--stake", default="0.1", help="BNB to stake")
@click.pass_context
def register(ctx, did, metadata, stake):
    c = _chain(ctx)
    wei = int(float(stake) * 10**18)
    tx = c.register_model(did, metadata, wei)
    click.echo(json.dumps({"tx": tx, "did": did, "stake_wei": wei}, indent=2))


@main.command()
@click.argument("did")
@click.argument("delta", type=int)
@click.pass_context
def reputation(ctx, did, delta):
    c = _chain(ctx)
    tx = c.grant_reputation(did, delta)
    click.echo(json.dumps({"tx": tx, "did": did, "delta": delta}, indent=2))


@main.command()
@click.argument("artifact", type=click.Path(exists=True))
@click.pass_context
def hash(ctx, artifact):
    """Compute the four-hash fingerprint for an artifact."""
    h = compute_hashes(artifact)
    click.echo(json.dumps(h.as_hex(), indent=2))


@main.command()
@click.argument("artifact", type=click.Path(exists=True))
@click.option("--min-rep", default=1, type=int)
@click.option("--min-stake", default=10**16, type=int, help="min stake in wei")
@click.option("--allow-revoked", is_flag=True)
@click.pass_context
def verify(ctx, artifact, min_rep, min_stake, allow_revoked):
    """Verify provenance of an artifact and print a report."""
    c = _chain(ctx)
    v = Verifier(c, min_reputation=min_rep, min_stake_wei=min_stake, allow_revoked=allow_revoked)
    report = v.verify(artifact)
    click.echo(json.dumps(report.to_dict(), indent=2))


@main.command()
@click.argument("did")
@click.argument("artifact", type=click.Path(exists=True))
@click.option("--prompt", required=True)
@click.pass_context
def attest(ctx, did, artifact, prompt):
    """Attach a GENERATION attestation to an existing artifact file.

    Useful for retroactively attesting a known-good output when you can't
    hook into the generator itself.
    """
    import hashlib, secrets
    c = _chain(ctx)
    s = _storage(ctx)
    data = Path(artifact).read_bytes()
    h = compute_hashes(data)
    salt = secrets.token_bytes(16)
    commit = hashlib.sha256(prompt.encode() + salt).digest()
    uri = s.put({
        "spec": "modelledger/1", "op": "GENERATION",
        "model_did": did, "hashes": h.as_hex(), "salt": salt.hex(),
    })
    _, aid = c.post_attestation(did, OpType.GENERATION, h.sha256, h.phash, h.clip, commit, [], uri)
    click.echo(json.dumps({"attestation_id": "0x" + aid.hex(), "manifest": uri}, indent=2))


if __name__ == "__main__":
    main()
