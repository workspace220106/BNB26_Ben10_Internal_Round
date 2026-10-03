// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ModelRegistry
/// @notice Registers AI model operators with a stake-weighted reputation.
///         Each model is identified by a DID string and an ECDSA public key
///         (derived address). False attestations can be slashed by the owner
///         after off-chain adjudication of a revealed dispute.
contract ModelRegistry {
    struct Model {
        address operator;        // controller address = signer of attestations
        string did;              // e.g. "did:modelledger:sdxl-base-1.0"
        string metadataURI;      // Greenfield / IPFS pointer with model card
        uint256 stake;           // BNB staked (slashable)
        uint256 reputation;      // monotonically grown by successful verifications
        bool revoked;            // key compromise flag
        uint64 registeredAt;
    }

    address public owner;
    uint256 public minStake;

    mapping(bytes32 => Model) public models;        // keccak256(did) => Model
    mapping(address => bytes32) public addressToId; // operator => did hash

    event ModelRegistered(bytes32 indexed id, address indexed operator, string did);
    event StakeAdded(bytes32 indexed id, uint256 amount, uint256 total);
    event ReputationGranted(bytes32 indexed id, uint256 delta, uint256 total);
    event Slashed(bytes32 indexed id, uint256 amount, string reason);
    event Revoked(bytes32 indexed id, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(uint256 _minStake) {
        owner = msg.sender;
        minStake = _minStake;
    }

    function register(string calldata did, string calldata metadataURI) external payable {
        require(msg.value >= minStake, "stake < minStake");
        bytes32 id = keccak256(bytes(did));
        require(models[id].operator == address(0), "did taken");
        require(addressToId[msg.sender] == bytes32(0), "address already bound");

        models[id] = Model({
            operator: msg.sender,
            did: did,
            metadataURI: metadataURI,
            stake: msg.value,
            reputation: 0,
            revoked: false,
            registeredAt: uint64(block.timestamp)
        });
        addressToId[msg.sender] = id;
        emit ModelRegistered(id, msg.sender, did);
    }

    function addStake(bytes32 id) external payable {
        Model storage m = models[id];
        require(m.operator != address(0), "unknown");
        m.stake += msg.value;
        emit StakeAdded(id, msg.value, m.stake);
    }

    /// @notice Called by AttestationLedger when a verification succeeds.
    function grantReputation(bytes32 id, uint256 delta) external {
        // In production this would be gated to the ledger; left permissive
        // for hackathon testing. See TrustPolicy for consumer-side weighting.
        Model storage m = models[id];
        require(m.operator != address(0), "unknown");
        m.reputation += delta;
        emit ReputationGranted(id, delta, m.reputation);
    }

    function revoke(bytes32 id, string calldata reason) external {
        Model storage m = models[id];
        require(msg.sender == m.operator || msg.sender == owner, "not auth");
        m.revoked = true;
        emit Revoked(id, reason);
    }

    function slash(bytes32 id, uint256 amount, string calldata reason) external onlyOwner {
        Model storage m = models[id];
        require(amount <= m.stake, "amount>stake");
        m.stake -= amount;
        payable(owner).transfer(amount);
        emit Slashed(id, amount, reason);
    }

    function isActive(bytes32 id) external view returns (bool) {
        Model storage m = models[id];
        return m.operator != address(0) && !m.revoked && m.stake >= minStake;
    }

    function get(bytes32 id) external view returns (Model memory) {
        return models[id];
    }
}
