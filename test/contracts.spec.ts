import { expect } from "chai";
import { ethers } from "hardhat";

describe("ModelLedger core", () => {
  async function fixture() {
    const [owner, opA, opB, consumer] = await ethers.getSigners();
    const minStake = ethers.parseEther("0.01");
    const Registry = await ethers.getContractFactory("ModelRegistry");
    const registry = await Registry.deploy(minStake);
    const Ledger = await ethers.getContractFactory("AttestationLedger");
    const ledger = await Ledger.deploy(await registry.getAddress());
    const Policy = await ethers.getContractFactory("TrustPolicy");
    const policy = await Policy.deploy(await registry.getAddress(), await ledger.getAddress());
    return { owner, opA, opB, consumer, registry, ledger, policy, minStake };
  }

  it("registers a model and posts a generation", async () => {
    const { opA, registry, ledger } = await fixture();
    await registry.connect(opA).register("did:ml:sdxl", "ipfs://card", { value: ethers.parseEther("0.1") });
    const id = ethers.keccak256(ethers.toUtf8Bytes("did:ml:sdxl"));
    expect(await registry.isActive(id)).to.eq(true);

    const sha = ethers.keccak256(ethers.toUtf8Bytes("file"));
    const ph = ethers.keccak256(ethers.toUtf8Bytes("phash"));
    const ch = ethers.keccak256(ethers.toUtf8Bytes("clip"));
    const pc = ethers.keccak256(ethers.toUtf8Bytes("prompt||salt"));
    const tx = await ledger.connect(opA).post(id, 0, sha, ph, ch, pc, [], "ipfs://m");
    const rc = await tx.wait();
    expect(rc!.logs.length).to.be.greaterThan(0);
    const matches = await ledger.findBySha(sha);
    expect(matches.length).to.eq(1);
  });

  it("classifies verdicts correctly", async () => {
    const { opA, registry, ledger, policy, minStake } = await fixture();
    await registry.connect(opA).register("did:ml:x", "ipfs://x", { value: ethers.parseEther("0.1") });
    const mid = ethers.keccak256(ethers.toUtf8Bytes("did:ml:x"));
    await registry.grantReputation(mid, 100);
    const sha = ethers.keccak256(ethers.toUtf8Bytes("f"));
    const ph = ethers.keccak256(ethers.toUtf8Bytes("p"));
    const ch = ethers.keccak256(ethers.toUtf8Bytes("c"));
    await ledger.connect(opA).post(mid, 0, sha, ph, ch, ethers.ZeroHash, [], "ipfs://m");
    const ids = await ledger.findBySha(sha);
    const [v] = await policy.classify(ids, { minReputation: 10, minStake, allowRevokedChain: false });
    expect(v).to.eq(2); // TRUSTED
  });
});
