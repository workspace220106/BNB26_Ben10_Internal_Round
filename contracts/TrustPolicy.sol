// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ModelRegistry.sol";
import "./AttestationLedger.sol";

/// @title TrustPolicy
/// @notice Consumer-side helper. Given an artifact's attestation ids and the
///         caller's policy (min reputation, max chain length, allowed op
///         types), classifies the artifact as Trusted / SelfAsserted /
///         Unverifiable / Conflicting.
contract TrustPolicy {
    enum Verdict { UNVERIFIABLE, SELF_ASSERTED, TRUSTED, CONFLICTING }

    struct Policy {
        uint256 minReputation;
        uint256 minStake;
        bool allowRevokedChain;
    }

    ModelRegistry public immutable registry;
    AttestationLedger public immutable ledger;

    constructor(address _registry, address _ledger) {
        registry = ModelRegistry(_registry);
        ledger = AttestationLedger(_ledger);
    }

    function classify(bytes32[] calldata matchingIds, Policy calldata p)
        external
        view
        returns (Verdict verdict, bytes32 chosen)
    {
        if (matchingIds.length == 0) return (Verdict.UNVERIFIABLE, bytes32(0));

        // Detect conflict: two live attestations from distinct operators with
        // mutually incompatible op types (both claim GENERATION).
        uint256 gens;
        for (uint256 i = 0; i < matchingIds.length; i++) {
            AttestationLedger.Attestation memory a = ledger.get(matchingIds[i]);
            if (!a.revoked && a.opType == AttestationLedger.OpType.GENERATION) gens++;
        }
        if (gens > 1) return (Verdict.CONFLICTING, bytes32(0));

        bool anyTrusted;
        bytes32 best;
        uint256 bestRep;
        for (uint256 i = 0; i < matchingIds.length; i++) {
            AttestationLedger.Attestation memory a = ledger.get(matchingIds[i]);
            if (a.revoked && !p.allowRevokedChain) continue;
            ModelRegistry.Model memory m = registry.get(a.modelId);
            if (m.operator == address(0)) continue;
            if (m.revoked && !p.allowRevokedChain) continue;
            if (m.reputation >= p.minReputation && m.stake >= p.minStake) {
                anyTrusted = true;
                if (m.reputation >= bestRep) { bestRep = m.reputation; best = matchingIds[i]; }
            } else if (best == bytes32(0)) {
                best = matchingIds[i];
            }
        }

        if (best == bytes32(0)) return (Verdict.UNVERIFIABLE, bytes32(0));
        return (anyTrusted ? Verdict.TRUSTED : Verdict.SELF_ASSERTED, best);
    }
}
