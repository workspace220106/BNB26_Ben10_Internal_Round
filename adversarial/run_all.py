"""Run every adversarial scenario and print a scoreboard."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sdk"))

from adversarial import (                                         # noqa: E402
    attack_forged_claim,
    attack_revoked_key,
    attack_transform_chain,
    attack_hash_collision,
    attack_conflicting_claims,
)

SCENARIOS = [
    attack_forged_claim,
    attack_revoked_key,
    attack_transform_chain,
    attack_hash_collision,
    attack_conflicting_claims,
]


def main() -> int:
    results = []
    for mod in SCENARIOS:
        try:
            r = mod.run()
        except Exception as e:
            r = {"attack": mod.__name__.split(".")[-1], "passed": False, "error": repr(e)}
        results.append(r)
        print(json.dumps(r, indent=2))
        print("-" * 60)

    passed = sum(1 for r in results if r.get("passed"))
    print(f"\nPASSED {passed}/{len(results)} adversarial scenarios")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
