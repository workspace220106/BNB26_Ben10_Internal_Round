import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("deploying as", deployer.address);

  const MIN_STAKE = ethers.parseEther("0.01");

  const Registry = await ethers.getContractFactory("ModelRegistry");
  const registry = await Registry.deploy(MIN_STAKE);
  await registry.waitForDeployment();

  const Ledger = await ethers.getContractFactory("AttestationLedger");
  const ledger = await Ledger.deploy(await registry.getAddress());
  await ledger.waitForDeployment();

  const Graph = await ethers.getContractFactory("TransformationGraph");
  const graph = await Graph.deploy(await ledger.getAddress());
  await graph.waitForDeployment();

  const Policy = await ethers.getContractFactory("TrustPolicy");
  const policy = await Policy.deploy(await registry.getAddress(), await ledger.getAddress());
  await policy.waitForDeployment();

  const addrs = {
    ModelRegistry: await registry.getAddress(),
    AttestationLedger: await ledger.getAddress(),
    TransformationGraph: await graph.getAddress(),
    TrustPolicy: await policy.getAddress(),
    minStake: MIN_STAKE.toString(),
    chainId: Number((await ethers.provider.getNetwork()).chainId)
  };
  const out = path.join(__dirname, "..", "deployments.json");
  fs.writeFileSync(out, JSON.stringify(addrs, null, 2));
  console.log("deployed:", addrs);
}

main().catch((e) => { console.error(e); process.exit(1); });
