// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ModelRegistry.sol";

/// @title AttestationLedger
/// @notice Immutable log of generation and transformation events. Each
///         attestation binds an artifact (by multi-hash) to a model operator
///         and optionally to parent artifacts, forming a provenance DAG.
contract AttestationLedger {
    enum OpType { GENERATION, TRANSFORMATION, COMPOSITION }

    struct Attestation {
        bytes32 modelId;          // ModelRegistry key
        OpType opType;
        bytes32 sha256Hash;       // bitwise hash of the raw output file
        bytes32 pHash;            // perceptual hash (dct-based, 64-bit left-padded)
        bytes32 clipHash;         // bucketed CLIP embedding hash
        bytes32 promptCommit;     // keccak256(prompt || salt)
        bytes32[] parents;        // attestationIds of input artifacts (DAG edges)
        string manifestURI;       // Greenfield / IPFS CID of full manifest
        address signer;
        uint64 timestamp;
        bool revoked;
    }

    ModelRegistry public immutable registry;

    mapping(bytes32 => Attestation) public attestations;        // attestationId => data
    mapping(bytes32 => bytes32[]) public bySha;                  // sha256 => ids
    mapping(bytes32 => bytes32[]) public byPhash;                // phash => ids
    mapping(bytes32 => bytes32[]) public byClip;                 // clip  => ids
    mapping(bytes32 => bytes32[]) public children;               // parentId => childIds

    event AttestationPosted(
        bytes32 indexed id,
        bytes32 indexed modelId,
        OpType opType,
        bytes32 sha256Hash,
        bytes32 pHash,
        bytes32 clipHash
    );
    event AttestationRevoked(bytes32 indexed id, string reason);

    constructor(address _registry) {
        registry = ModelRegistry(_registry);
    }

    /// @notice Post a signed attestation. The operator must be the model owner.
    function post(
        bytes32 modelId,
        OpType opType,
        bytes32 sha256Hash,
        bytes32 pHash,
        bytes32 clipHash,
        bytes32 promptCommit,
        bytes32[] calldata parents,
        string calldata manifestURI
    ) external returns (bytes32 id) {
        ModelRegistry.Model memory m = registry.get(modelId);
        require(m.operator == msg.sender, "not model operator");
        require(!m.revoked, "model revoked");

        id = keccak256(
            abi.encode(modelId, sha256Hash, pHash, clipHash, promptCommit, block.timestamp, msg.sender)
        );
        require(attestations[id].signer == address(0), "duplicate");

        attestations[id] = Attestation({
            modelId: modelId,
            opType: opType,
            sha256Hash: sha256Hash,
            pHash: pHash,
            clipHash: clipHash,
            promptCommit: promptCommit,
            parents: parents,
            manifestURI: manifestURI,
            signer: msg.sender,
            timestamp: uint64(block.timestamp),
            revoked: false
        });

        bySha[sha256Hash].push(id);
        byPhash[pHash].push(id);
        byClip[clipHash].push(id);
        for (uint256 i = 0; i < parents.length; i++) {
            children[parents[i]].push(id);
        }

        emit AttestationPosted(id, modelId, opType, sha256Hash, pHash, clipHash);
    }

    function revoke(bytes32 id, string calldata reason) external {
        Attestation storage a = attestations[id];
        require(a.signer == msg.sender, "not signer");
        a.revoked = true;
        emit AttestationRevoked(id, reason);
    }

    function get(bytes32 id) external view returns (Attestation memory) {
        return attestations[id];
    }

    function findBySha(bytes32 h) external view returns (bytes32[] memory) { return bySha[h]; }
    function findByPhash(bytes32 h) external view returns (bytes32[] memory) { return byPhash[h]; }
    function findByClip(bytes32 h) external view returns (bytes32[] memory) { return byClip[h]; }
    function childrenOf(bytes32 id) external view returns (bytes32[] memory) { return children[id]; }
    function parentsOf(bytes32 id) external view returns (bytes32[] memory) { return attestations[id].parents; }
}
