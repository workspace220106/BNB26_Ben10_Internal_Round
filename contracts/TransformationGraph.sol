// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AttestationLedger.sol";

/// @title TransformationGraph
/// @notice View helpers that walk the provenance DAG stored in
///         AttestationLedger. Separated so the core ledger stays small and
///         cheap to write to.
contract TransformationGraph {
    AttestationLedger public immutable ledger;

    constructor(address _ledger) {
        ledger = AttestationLedger(_ledger);
    }

    /// @notice Walk ancestors breadth-first up to `maxDepth`. Returns ids in
    ///         discovery order (child-first). Cycles are impossible because
    ///         attestation ids embed timestamp + content hash.
    function ancestors(bytes32 id, uint256 maxDepth) external view returns (bytes32[] memory out) {
        bytes32[] memory frontier = new bytes32[](1);
        frontier[0] = id;
        bytes32[] memory buffer = new bytes32[](256);
        uint256 n;

        for (uint256 d = 0; d < maxDepth && frontier.length > 0; d++) {
            bytes32[] memory next = new bytes32[](0);
            for (uint256 i = 0; i < frontier.length; i++) {
                bytes32[] memory ps = ledger.parentsOf(frontier[i]);
                for (uint256 j = 0; j < ps.length; j++) {
                    if (n >= buffer.length) break;
                    buffer[n++] = ps[j];
                    next = _append(next, ps[j]);
                }
            }
            frontier = next;
        }

        out = new bytes32[](n);
        for (uint256 k = 0; k < n; k++) out[k] = buffer[k];
    }

    function descendants(bytes32 id, uint256 maxDepth) external view returns (bytes32[] memory out) {
        bytes32[] memory frontier = new bytes32[](1);
        frontier[0] = id;
        bytes32[] memory buffer = new bytes32[](256);
        uint256 n;

        for (uint256 d = 0; d < maxDepth && frontier.length > 0; d++) {
            bytes32[] memory next = new bytes32[](0);
            for (uint256 i = 0; i < frontier.length; i++) {
                bytes32[] memory cs = ledger.childrenOf(frontier[i]);
                for (uint256 j = 0; j < cs.length; j++) {
                    if (n >= buffer.length) break;
                    buffer[n++] = cs[j];
                    next = _append(next, cs[j]);
                }
            }
            frontier = next;
        }

        out = new bytes32[](n);
        for (uint256 k = 0; k < n; k++) out[k] = buffer[k];
    }

    function _append(bytes32[] memory arr, bytes32 x) internal pure returns (bytes32[] memory r) {
        r = new bytes32[](arr.length + 1);
        for (uint256 i = 0; i < arr.length; i++) r[i] = arr[i];
        r[arr.length] = x;
    }
}
