import { ethers } from "hardhat";
import { Wallet, keccak256, solidityPackedKeccak256, getBytes, toUtf8Bytes, ZeroAddress } from "ethers";
import * as fs from "fs";
import * as path from "path";

/**
 * BondModule Deployment Demo Script
 *
 * This script demonstrates BondModule functionality using already deployed contracts.
 * It shows how to:
 * 1. Connect to deployed contracts
 * 2. Pre-compute Nexus account address
 * 3. Execute atomic deployment + distribution via Multicall3
 *
 * Network: Base Sepolia
 * Run: PRIVATE_KEY=your_key npx hardhat run scripts/hardhat/deployBondModule.ts --network baseSepolia
 */

// Deployed contract addresses from Foundry deployment
const DEPLOYED_ADDRESSES = {
  K1Validator: "0x282605a7ea3892f9a83cf0be621199a6be28ec88",
  MockRegistry: "0x33d9cd23ac7045ab2ccd5f573d6546c2d7e2e6b6",
  NexusBootstrap: "0x646d0a1573b0cc77e0e818b1e828fc6578d224c5",
  NexusImplementation: "0x4ef716f2cd47645b9e37c74a25b8ddcc4b9d3736",
  NexusAccountFactory: "0x8eace774786a98dcb84f7322f43d2108973625e7",
  BiconomyMetaFactory: "0x707c7d8332595014ff814125f10a356685b60a2a",
  BondModule: "0xe0146a494c24775ab07e58107f6e96456ad62dca",
  MockToken: "0x24063f25a4b37047e69bdd029efcba5f298700b7",
  EscrowZyFAI: "0x4064db9a9bab77df20f223e13dac784bb43b4386",
  EscrowGiza: "0x558eaafb72be735e5e6f5a4280e948a6109c26bc",
  EscrowCod3x: "0x1ea3939bcc4c1fce86b14ba6dd893a4796c38f59",
};

const BASE_SEPOLIA_ENTRYPOINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const INITIAL_TOKEN_BALANCE = 10_000_000_000n;
const ALLOWANCE_CAP = 10_000_000_000n;

const ALLOCATION_ZYFAI = 3000; // 30%
const ALLOCATION_GIZA = 3000; // 30%
const ALLOCATION_COD3X = 4000; // 40%
const TOTAL_PERCENTAGE = 10000; // 100%

interface DeployedContracts {
  k1Validator: any;
  mockRegistry: any;
  nexusBootstrap: any;
  nexusAccountFactory: any;
  biconomyMetaFactory: any;
  bondModule: any;
  mockToken: any;
}

async function main() {
  console.log("\n=== BONDMODULE ATOMIC DEPLOYMENT + DISTRIBUTION ===");

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable not set");
  }

  const deployer = new Wallet(privateKey, ethers.provider);
  const owner = await deployer.getAddress();
  const teeServer = await deployer.getAddress();

  console.log("Deployer:", owner);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);

  const contracts = await connectToDeployedContracts(deployer);
  const { accountAddress, initData, salt } = await preComputeAccountAddress(contracts, owner);

  console.log("\n[Step 3] Checking if account already deployed...");
  const existingCode = await ethers.provider.getCode(accountAddress);
  if (existingCode !== "0x") {
    console.log("⚠️  Account already deployed at:", accountAddress);
    console.log("Skipping deployment. Use a different salt for a new account.");
    await updateDeploymentsJson(accountAddress);
    return;
  }

  console.log("✓ Account not yet deployed, proceeding with atomic deployment...");

  await mintTokensToAccount(contracts.mockToken, accountAddress);
  await deployAccountAndExecuteDistribution(contracts, accountAddress, initData, salt, owner, deployer);
  await updateDeploymentsJson(accountAddress);

  console.log("\n=== ATOMIC DEPLOYMENT COMPLETE ===");
}

async function connectToDeployedContracts(deployer: Wallet): Promise<DeployedContracts> {
  console.log("\n[Step 1] Connecting to deployed contracts...");

  const k1Validator = await ethers.getContractAt("K1Validator", DEPLOYED_ADDRESSES.K1Validator, deployer);
  console.log("✓ K1Validator:", await k1Validator.getAddress());

  const mockRegistry = await ethers.getContractAt("MockRegistry", DEPLOYED_ADDRESSES.MockRegistry, deployer);
  console.log("✓ MockRegistry:", await mockRegistry.getAddress());

  const nexusBootstrap = await ethers.getContractAt("NexusBootstrap", DEPLOYED_ADDRESSES.NexusBootstrap, deployer);
  console.log("✓ NexusBootstrap:", await nexusBootstrap.getAddress());

  const nexusAccountFactory = await ethers.getContractAt("NexusAccountFactory", DEPLOYED_ADDRESSES.NexusAccountFactory, deployer);
  console.log("✓ NexusAccountFactory:", await nexusAccountFactory.getAddress());

  const biconomyMetaFactory = await ethers.getContractAt("BiconomyMetaFactory", DEPLOYED_ADDRESSES.BiconomyMetaFactory, deployer);
  console.log("✓ BiconomyMetaFactory:", await biconomyMetaFactory.getAddress());

  const bondModule = await ethers.getContractAt("BondModule", DEPLOYED_ADDRESSES.BondModule, deployer);
  console.log("✓ BondModule:", await bondModule.getAddress());

  const mockToken = await ethers.getContractAt("MockToken", DEPLOYED_ADDRESSES.MockToken, deployer);
  console.log("✓ Mock Token:", await mockToken.getAddress());

  console.log("✓ ZyFAI Vault:", DEPLOYED_ADDRESSES.EscrowZyFAI);
  console.log("✓ Giza Vault:", DEPLOYED_ADDRESSES.EscrowGiza);
  console.log("✓ Cod3x Vault:", DEPLOYED_ADDRESSES.EscrowCod3x);

  return {
    k1Validator,
    mockRegistry,
    nexusBootstrap,
    nexusAccountFactory,
    biconomyMetaFactory,
    bondModule,
    mockToken,
  };
}

async function preComputeAccountAddress(contracts: DeployedContracts, owner: string) {
  console.log("\n[Step 2] Pre-computing account address...");

  const tokenAddresses = [await contracts.mockToken.getAddress()];
  const totalAmounts = [ALLOWANCE_CAP];
  const executorInstallData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]", "uint256[]"], [tokenAddresses, totalAmounts]);

  const executors = [{ module: await contracts.bondModule.getAddress(), data: executorInstallData }];
  const registryConfig = { registry: await contracts.mockRegistry.getAddress(), attesters: [owner], threshold: 1 };

  const initCall = contracts.nexusBootstrap.interface.encodeFunctionData("initNexusWithDefaultValidatorAndOtherModules", [
    owner,
    [],
    executors,
    { module: ZeroAddress, data: "0x" },
    [],
    [],
    registryConfig,
  ]);

  const initData = ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes"], [await contracts.nexusBootstrap.getAddress(), initCall]);

  // Use a timestamp-based salt for unique deployment each time
  const timestamp = Math.floor(Date.now() / 1000);
  const salt = keccak256(toUtf8Bytes(`nexus-bondmodule-hardhat-${timestamp}`));
  const accountAddress = await contracts.nexusAccountFactory.computeAccountAddress(initData, salt);

  console.log("Pre-computed Account Address:", accountAddress);

  return { accountAddress, initData, salt };
}

async function mintTokensToAccount(mockToken: any, accountAddress: string) {
  console.log("\n[Step 4] Minting tokens to pre-computed address...");
  console.log("Target address:", accountAddress);
  console.log("Address has code?", (await ethers.provider.getCode(accountAddress)) !== "0x");

  const tx = await mockToken.mint(accountAddress, INITIAL_TOKEN_BALANCE);
  await tx.wait();

  const balance = await mockToken.balanceOf(accountAddress);
  console.log("✓ Minted", INITIAL_TOKEN_BALANCE.toString(), "tokens");
  console.log("Pre-computed address token balance:", balance.toString());
}

async function deployAccountAndExecuteDistribution(
  contracts: DeployedContracts,
  accountAddress: string,
  initData: string,
  salt: string,
  owner: string,
  deployer: Wallet
) {
  console.log("\n[Step 5] Deploying account and executing distribution in ATOMIC SINGLE TX...");

  // Prepare factory deployment call data
  const factoryData = contracts.nexusAccountFactory.interface.encodeFunctionData("createAccount", [initData, salt]);

  // Get account balance and calculate distribution amounts
  const accountBalance = await contracts.mockToken.balanceOf(accountAddress);
  const amountZyFAI = (accountBalance * BigInt(ALLOCATION_ZYFAI)) / BigInt(TOTAL_PERCENTAGE);
  const amountGiza = (accountBalance * BigInt(ALLOCATION_GIZA)) / BigInt(TOTAL_PERCENTAGE);
  const amountCod3x = (accountBalance * BigInt(ALLOCATION_COD3X)) / BigInt(TOTAL_PERCENTAGE);

  console.log("Distribution amounts:");
  console.log("- ZyFAI (30%):", amountZyFAI.toString());
  console.log("- Giza (30%):", amountGiza.toString());
  console.log("- Cod3x (40%):", amountCod3x.toString());

  // Create interface for escrow vault deposit function
  const escrowInterface = new ethers.Interface(["function deposit(uint256 amount)"]);

  // Prepare batch executions (3 approvals + 3 deposits)
  const executions = [
    {
      target: await contracts.mockToken.getAddress(),
      value: 0,
      callData: contracts.mockToken.interface.encodeFunctionData("approve", [DEPLOYED_ADDRESSES.EscrowZyFAI, amountZyFAI]),
    },
    {
      target: DEPLOYED_ADDRESSES.EscrowZyFAI,
      value: 0,
      callData: escrowInterface.encodeFunctionData("deposit", [amountZyFAI]),
    },
    {
      target: await contracts.mockToken.getAddress(),
      value: 0,
      callData: contracts.mockToken.interface.encodeFunctionData("approve", [DEPLOYED_ADDRESSES.EscrowGiza, amountGiza]),
    },
    {
      target: DEPLOYED_ADDRESSES.EscrowGiza,
      value: 0,
      callData: escrowInterface.encodeFunctionData("deposit", [amountGiza]),
    },
    {
      target: await contracts.mockToken.getAddress(),
      value: 0,
      callData: contracts.mockToken.interface.encodeFunctionData("approve", [DEPLOYED_ADDRESSES.EscrowCod3x, amountCod3x]),
    },
    {
      target: DEPLOYED_ADDRESSES.EscrowCod3x,
      value: 0,
      callData: escrowInterface.encodeFunctionData("deposit", [amountCod3x]),
    },
  ];

  const executionBatch = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address target, uint256 value, bytes callData)[]"],
    [executions]
  );

  // Generate TEE attestation signature
  const nonce = Math.floor(Date.now() / 1000);
  const allowedPercentageBps = TOTAL_PERCENTAGE;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const attestationHash = solidityPackedKeccak256(
    ["uint256", "address", "address", "uint256", "uint256", "bytes"],
    [chainId, accountAddress, await contracts.mockToken.getAddress(), allowedPercentageBps, nonce, executionBatch]
  );

  const ethSignedHash = keccak256(
    ethers.concat([toUtf8Bytes("\x19Ethereum Signed Message:\n32"), getBytes(attestationHash)])
  );

  const signature = deployer.signingKey.sign(ethSignedHash).serialized;

  // Prepare executeBatchWithAttestation call data
  const batchExecutionData = contracts.bondModule.interface.encodeFunctionData("executeBatchWithAttestation", [
    accountAddress,
    executionBatch,
    await contracts.mockToken.getAddress(),
    allowedPercentageBps,
    nonce,
    signature,
  ]);

  // Create Multicall3 calls array
  const multicall3 = await ethers.getContractAt("IMulticall3", MULTICALL3, deployer);

  const calls = [
    {
      target: DEPLOYED_ADDRESSES.BiconomyMetaFactory,
      allowFailure: false,
      callData: contracts.biconomyMetaFactory.interface.encodeFunctionData("deployWithFactory", [
        DEPLOYED_ADDRESSES.NexusAccountFactory,
        factoryData,
      ]),
    },
    {
      target: DEPLOYED_ADDRESSES.BondModule,
      allowFailure: false,
      callData: batchExecutionData,
    },
  ];

  console.log("Executing atomic deployment + distribution via Multicall3...");
  console.log("Call 1: Deploy Nexus account");
  console.log("Call 2: Execute 30-30-40 distribution (6 operations)");

  // Execute both calls atomically in single transaction
  const tx = await multicall3.aggregate3(calls, { gasLimit: 5000000 });
  const receipt = await tx.wait();

  console.log("✓ Transaction hash:", receipt.hash);
  console.log("✓ Gas used:", receipt.gasUsed.toString());

  // Verify account deployment
  const deployedCode = await ethers.provider.getCode(accountAddress);
  if (deployedCode === "0x") {
    throw new Error("Account deployment failed - no code at address");
  }
  console.log("✓ Nexus Account deployed at:", accountAddress);

  // Verify BondModule initialization
  const isInitialized = await contracts.bondModule.isInitialized(accountAddress);
  console.log("✓ BondModule initialized:", isInitialized);

  const isAgentMode = await contracts.bondModule.isAgentModeActivated(accountAddress);
  console.log("✓ Agent mode activated:", isAgentMode);

  console.log("[SUCCESS] Atomic deployment + distribution completed in 1 tx!");
}

async function updateDeploymentsJson(nexusAccountAddress: string) {
  console.log("\n[Step 6] Updating deployments.json...");

  const deploymentsPath = path.join(__dirname, "../../deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  // Update bondModule deployment info
  if (!deployments.networks) {
    deployments.networks = {};
  }
  if (!deployments.networks.baseSepolia) {
    deployments.networks.baseSepolia = {};
  }
  if (!deployments.networks.baseSepolia.modules) {
    deployments.networks.baseSepolia.modules = {};
  }

  deployments.networks.baseSepolia.modules.bondModule = {
    address: DEPLOYED_ADDRESSES.BondModule,
    transactionHash: "Latest deployment via Foundry",
    blockNumber: "Latest",
    verified: false,
    basescanLink: `https://sepolia.basescan.org/address/${DEPLOYED_ADDRESSES.BondModule}`,
    deploymentDate: new Date().toISOString().split("T")[0],
    features: {
      agentMode: true,
      percentageBasedLimits: true,
      teeAttestation: true,
      replayProtection: true,
      yieldProtocolIntegration: true,
      atomicMulticall3Deployment: true,
    },
    demoAccount: {
      preComputedAddress: nexusAccountAddress,
      basescanLink: `https://sepolia.basescan.org/address/${nexusAccountAddress}`,
    },
    escrowVaults: {
      zyfai: {
        address: DEPLOYED_ADDRESSES.EscrowZyFAI,
        allocation: "30%",
        basescanLink: `https://sepolia.basescan.org/address/${DEPLOYED_ADDRESSES.EscrowZyFAI}`,
      },
      giza: {
        address: DEPLOYED_ADDRESSES.EscrowGiza,
        allocation: "30%",
        basescanLink: `https://sepolia.basescan.org/address/${DEPLOYED_ADDRESSES.EscrowGiza}`,
      },
      cod3x: {
        address: DEPLOYED_ADDRESSES.EscrowCod3x,
        allocation: "40%",
        basescanLink: `https://sepolia.basescan.org/address/${DEPLOYED_ADDRESSES.EscrowCod3x}`,
      },
    },
    mockToken: {
      address: DEPLOYED_ADDRESSES.MockToken,
      name: "Test USDC",
      symbol: "USDC",
      decimals: 6,
      basescanLink: `https://sepolia.basescan.org/address/${DEPLOYED_ADDRESSES.MockToken}`,
    },
    coreContracts: {
      k1Validator: DEPLOYED_ADDRESSES.K1Validator,
      mockRegistry: DEPLOYED_ADDRESSES.MockRegistry,
      nexusBootstrap: DEPLOYED_ADDRESSES.NexusBootstrap,
      nexusImplementation: DEPLOYED_ADDRESSES.NexusImplementation,
      nexusAccountFactory: DEPLOYED_ADDRESSES.NexusAccountFactory,
      biconomyMetaFactory: DEPLOYED_ADDRESSES.BiconomyMetaFactory,
    },
  };

  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("✓ Updated deployments.json with BondModule info");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
