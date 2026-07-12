import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  toBytes,
  Address,
  hexToBytes,
  concat,
  pad,
  encodePacked,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface NetworkConfig {
  name: string;
  chainId: number;
  chain: any;
  rpcUrl: string;
  blockExplorer: string;
  contracts: any;
}

interface TestResult {
  success: boolean;
  message: string;
  txHash?: string;
  error?: string;
}

interface ModuleTestResult {
  moduleName: string;
  network: string;
  tests: {
    deployment: TestResult;
    configuration: TestResult;
    functionality: TestResult;
  };
}

// ============================================================================
// LOAD DEPLOYMENT DATA
// ============================================================================

const deploymentDataPath = path.join(__dirname, "../../deployments.json");
let deploymentData: any;

try {
  deploymentData = JSON.parse(fs.readFileSync(deploymentDataPath, "utf8"));
  console.log("✅ Deployment data loaded");
} catch (error) {
  console.error("❌ Failed to load deployment data from:", deploymentDataPath);
  console.error("Error:", error);
  process.exit(1);
}

// ============================================================================
// NETWORK CONFIGURATIONS
// ============================================================================

const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;

const NETWORKS: Record<string, NetworkConfig> = {
  arbitrumSepolia: {
    name: "Arbitrum Sepolia",
    chainId: 421614,
    chain: arbitrumSepolia,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
    blockExplorer: "https://sepolia.arbiscan.io",
    contracts: deploymentData.networks.arbitrumSepolia,
  },
  baseSepolia: {
    name: "Base Sepolia",
    chainId: 84532,
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
    blockExplorer: "https://sepolia.basescan.org",
    contracts: deploymentData.networks.baseSepolia,
  },
};

// ============================================================================
// ABI DEFINITIONS (Viem format)
// ============================================================================

const ERC20_ABI = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const NEXUS_ACCOUNT_FACTORY_ABI = [
  {
    inputs: [
      { name: "initData", type: "bytes" },
      { name: "salt", type: "bytes32" },
    ],
    name: "computeAccountAddress",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "initData", type: "bytes" },
      { name: "salt", type: "bytes32" },
    ],
    name: "createAccount",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

const BICONOMY_META_FACTORY_ABI = [
  {
    inputs: [
      { name: "factory", type: "address" },
      { name: "initData", type: "bytes" },
    ],
    name: "deployWithFactory",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const NEXUS_BOOTSTRAP_ABI = [
  {
    inputs: [
      { name: "defaultValidatorInitData", type: "bytes" },
      {
        name: "validators",
        type: "tuple[]",
        components: [
          { name: "module", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "executors",
        type: "tuple[]",
        components: [
          { name: "module", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "hook",
        type: "tuple",
        components: [
          { name: "module", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "fallbacks",
        type: "tuple[]",
        components: [
          { name: "module", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "preValidationHooks",
        type: "tuple[]",
        components: [
          { name: "hookType", type: "uint256" },
          { name: "module", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "registryConfig",
        type: "tuple",
        components: [
          { name: "registry", type: "address" },
          { name: "attesters", type: "address[]" },
          { name: "threshold", type: "uint8" },
        ],
      },
    ],
    name: "initNexusWithDefaultValidatorAndOtherModules",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

const AUTO_EARN_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nexusAccount", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    name: "autoEarn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "isInitialized",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const AUTO_BRIDGE_ABI = [
  {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "relayerFeePct", type: "uint256" },
      { name: "nexusAccount", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    name: "bridge",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "isInitialized",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const AUTO_SWAP_ABI = [
  {
    inputs: [
      { name: "inputToken", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "nexusAccount", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    name: "swap",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "isInitialized",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const MULTICALL3_ABI = [
  {
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    name: "aggregate3",
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// ============================================================================
// HELPER FUNCTION FOR DELAYS
// ============================================================================

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// MODULE TESTER CLASS
// ============================================================================

class ViemModuleTester {
  private publicClient: any;
  private walletClient: any;
  private account: any;
  private networkConfig: NetworkConfig;
  private contracts: any;

  constructor(networkName: keyof typeof NETWORKS, privateKey: string) {
    this.networkConfig = NETWORKS[networkName];
    this.contracts = this.networkConfig.contracts;

    // Create account from private key
    this.account = privateKeyToAccount(privateKey as `0x${string}`);

    // Create public client for reading
    this.publicClient = createPublicClient({
      chain: this.networkConfig.chain,
      transport: http(this.networkConfig.rpcUrl),
    });

    // Create wallet client for writing
    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.networkConfig.chain,
      transport: http(this.networkConfig.rpcUrl),
    });
  }

  async testAllModules(): Promise<ModuleTestResult[]> {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Testing All Modules on ${this.networkConfig.name}`);
    console.log(`${"=".repeat(80)}`);
    console.log(`Relayer Address: ${this.account.address}`);
    console.log(`Network: ${this.networkConfig.name} (Chain ID: ${this.networkConfig.chainId})`);
    console.log(`RPC URL: ${this.networkConfig.rpcUrl}`);

    const results: ModuleTestResult[] = [];

    // Test AutoEarn Module
    console.log("\n" + "─".repeat(80));
    const autoEarnResult = await this.testAutoEarnModule();
    results.push(autoEarnResult);

    // Wait between tests to avoid nonce issues
    await delay(3000);

    // Test AutoBridge Module
    console.log("\n" + "─".repeat(80));
    const autoBridgeResult = await this.testAutoBridgeModule();
    results.push(autoBridgeResult);

    // Wait between tests
    await delay(3000);

    // Test AutoSwap Module
    console.log("\n" + "─".repeat(80));
    const autoSwapResult = await this.testAutoSwapModule();
    results.push(autoSwapResult);

    return results;
  }

  async testAutoEarnModule(): Promise<ModuleTestResult> {
    console.log("\n🧪 Testing AutoEarn Module");

    const result: ModuleTestResult = {
      moduleName: "AutoEarn",
      network: this.networkConfig.name,
      tests: {
        deployment: { success: false, message: "" },
        configuration: { success: false, message: "" },
        functionality: { success: false, message: "" },
      },
    };

    try {
      // Test 1: Check module deployment
      const autoEarnAddress = this.contracts.modules.autoEarnModule.address as Address;
      const code = await this.publicClient.getBytecode({ address: autoEarnAddress });

      if (!code || code === "0x") {
        result.tests.deployment = { success: false, message: "AutoEarn module not deployed" };
        console.log("❌ AutoEarn module not deployed");
        return result;
      }

      result.tests.deployment = { success: true, message: "AutoEarn module deployed successfully" };
      console.log(`✅ AutoEarn module deployed at: ${autoEarnAddress}`);

      // Test 2: Check configuration
      const usdcAddress = this.contracts.externalIntegrations.usdcToken as Address;
      const relayerBalance = await this.publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [this.account.address],
      });

      const requiredAmount = parseUnits("0.1", 6);
      console.log(`💰 Relayer USDC balance: ${formatUnits(relayerBalance as bigint, 6)} USDC`);

      if ((relayerBalance as bigint) < requiredAmount) {
        result.tests.configuration = {
          success: false,
          message: `Insufficient USDC balance. Need ${formatUnits(requiredAmount, 6)}, have ${formatUnits(relayerBalance as bigint, 6)}`,
        };
        console.log(`❌ ${result.tests.configuration.message}`);
        return result;
      }

      result.tests.configuration = { success: true, message: "Configuration valid" };
      console.log("✅ Configuration valid");

      // Test 3: Check if aUSDC token exists before attempting deployment
      const aUSDCAddress = this.contracts.externalIntegrations.aUSDCToken as Address;
      const aUSDCCode = await this.publicClient.getBytecode({ address: aUSDCAddress });
      
      if (!aUSDCCode || aUSDCCode === "0x") {
        result.tests.functionality = {
          success: false,
          message: "aUSDC token not deployed on this network - skipping test",
          error: "Contract does not exist",
        };
        console.log(`⚠️  aUSDC token not found at ${aUSDCAddress} - skipping AutoEarn test`);
        return result;
      }

      // Test 3: Deploy account with AutoEarn and test functionality
      console.log("\n📦 Deploying account with AutoEarn module...");
      const accountResult = await this.deployAccountWithAutoEarn();

      if (accountResult.success) {
        result.tests.functionality = {
          success: true,
          message: "AutoEarn functionality tested successfully",
          txHash: accountResult.txHash,
        };
        console.log(`✅ AutoEarn functionality test passed`);
        console.log(`   Transaction: ${this.networkConfig.blockExplorer}/tx/${accountResult.txHash}`);
      } else {
        result.tests.functionality = {
          success: false,
          message: accountResult.message,
          error: accountResult.error,
        };
        console.log(`❌ AutoEarn functionality test failed: ${accountResult.message}`);
      }
    } catch (error: any) {
      console.error("❌ AutoEarn test error:", error.message);
      result.tests.functionality = {
        success: false,
        message: "Test failed with exception",
        error: error.message,
      };
    }

    return result;
  }

  async testAutoBridgeModule(): Promise<ModuleTestResult> {
    console.log("\n🧪 Testing AutoBridge Module");

    const result: ModuleTestResult = {
      moduleName: "AutoBridge",
      network: this.networkConfig.name,
      tests: {
        deployment: { success: false, message: "" },
        configuration: { success: false, message: "" },
        functionality: { success: false, message: "" },
      },
    };

    try {
      // Get bridge module address
      const bridgeModuleAddress = (this.contracts.modules.bridgeModule?.address ||
        this.contracts.modules.autoBridgeModule?.address) as Address;

      if (!bridgeModuleAddress) {
        result.tests.deployment = { success: false, message: "AutoBridge module address not found" };
        console.log("❌ AutoBridge module address not found");
        return result;
      }

      const code = await this.publicClient.getBytecode({ address: bridgeModuleAddress });

      if (!code || code === "0x") {
        result.tests.deployment = { success: false, message: "AutoBridge module not deployed" };
        console.log("❌ AutoBridge module not deployed");
        return result;
      }

      result.tests.deployment = { success: true, message: "AutoBridge module deployed successfully" };
      console.log(`✅ AutoBridge module deployed at: ${bridgeModuleAddress}`);

      // Test 2: Check configuration
      const usdcAddress = this.contracts.externalIntegrations.usdcToken as Address;
      const relayerBalance = await this.publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [this.account.address],
      });

      const requiredAmount = parseUnits("0.1", 6);
      console.log(`💰 Relayer USDC balance: ${formatUnits(relayerBalance as bigint, 6)} USDC`);

      if ((relayerBalance as bigint) < requiredAmount) {
        result.tests.configuration = {
          success: false,
          message: `Insufficient USDC balance. Need ${formatUnits(requiredAmount, 6)}, have ${formatUnits(relayerBalance as bigint, 6)}`,
        };
        console.log(`❌ ${result.tests.configuration.message}`);
        return result;
      }

      result.tests.configuration = { success: true, message: "Configuration valid" };
      console.log("✅ Configuration valid");

      // Test 3: Deploy account with AutoBridge
      console.log("\n📦 Deploying account with AutoBridge module...");
      const accountResult = await this.deployAccountWithAutoBridge();

      if (accountResult.success) {
        result.tests.functionality = {
          success: true,
          message: "AutoBridge functionality tested successfully",
          txHash: accountResult.txHash,
        };
        console.log(`✅ AutoBridge functionality test passed`);
        console.log(`   Transaction: ${this.networkConfig.blockExplorer}/tx/${accountResult.txHash}`);
      } else {
        result.tests.functionality = {
          success: false,
          message: accountResult.message,
          error: accountResult.error,
        };
        console.log(`❌ AutoBridge functionality test failed: ${accountResult.message}`);
      }
    } catch (error: any) {
      console.error("❌ AutoBridge test error:", error.message);
      result.tests.functionality = {
        success: false,
        message: "Test failed with exception",
        error: error.message,
      };
    }

    return result;
  }

  async testAutoSwapModule(): Promise<ModuleTestResult> {
    console.log("\n🧪 Testing AutoSwap Module");

    const result: ModuleTestResult = {
      moduleName: "AutoSwap",
      network: this.networkConfig.name,
      tests: {
        deployment: { success: false, message: "" },
        configuration: { success: false, message: "" },
        functionality: { success: false, message: "" },
      },
    };

    try {
      // Get swap module address
      const swapModuleAddress = (this.contracts.modules.swapModule?.address ||
        this.contracts.modules.autoSwapModule?.address) as Address;

      if (!swapModuleAddress) {
        result.tests.deployment = { success: false, message: "AutoSwap module address not found" };
        console.log("❌ AutoSwap module address not found");
        return result;
      }

      const code = await this.publicClient.getBytecode({ address: swapModuleAddress });

      if (!code || code === "0x") {
        result.tests.deployment = { success: false, message: "AutoSwap module not deployed" };
        console.log("❌ AutoSwap module not deployed");
        return result;
      }

      result.tests.deployment = { success: true, message: "AutoSwap module deployed successfully" };
      console.log(`✅ AutoSwap module deployed at: ${swapModuleAddress}`);

      // Test 2: Check configuration
      const usdcAddress = this.contracts.externalIntegrations.usdcToken as Address;
      const relayerBalance = await this.publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [this.account.address],
      });

      const requiredAmount = parseUnits("0.1", 6);
      console.log(`💰 Relayer USDC balance: ${formatUnits(relayerBalance as bigint, 6)} USDC`);

      if ((relayerBalance as bigint) < requiredAmount) {
        result.tests.configuration = {
          success: false,
          message: `Insufficient USDC balance. Need ${formatUnits(requiredAmount, 6)}, have ${formatUnits(relayerBalance as bigint, 6)}`,
        };
        console.log(`❌ ${result.tests.configuration.message}`);
        return result;
      }

      result.tests.configuration = { success: true, message: "Configuration valid" };
      console.log("✅ Configuration valid");

      // Test 3: Deploy account with AutoSwap
      console.log("\n📦 Deploying account with AutoSwap module...");
      const accountResult = await this.deployAccountWithAutoSwap();

      if (accountResult.success) {
        result.tests.functionality = {
          success: true,
          message: "AutoSwap functionality tested successfully",
          txHash: accountResult.txHash,
        };
        console.log(`✅ AutoSwap functionality test passed`);
        console.log(`   Transaction: ${this.networkConfig.blockExplorer}/tx/${accountResult.txHash}`);
      } else {
        result.tests.functionality = {
          success: false,
          message: accountResult.message,
          error: accountResult.error,
        };
        console.log(`❌ AutoSwap functionality test failed: ${accountResult.message}`);
      }
    } catch (error: any) {
      console.error("❌ AutoSwap test error:", error.message);
      result.tests.functionality = {
        success: false,
        message: "Test failed with exception",
        error: error.message,
      };
    }

    return result;
  }

  // ============================================================================
  // ACCOUNT DEPLOYMENT METHODS
  // ============================================================================

  async deployAccountWithAutoEarn(): Promise<TestResult> {
    try {
      // Create random user wallet
      const randomAccount = privateKeyToAccount(keccak256(toBytes(Date.now().toString())));
      console.log(`👤 Random User: ${randomAccount.address}`);

      // STEP 1: Calculate config hash for AutoEarn module
      const configData = encodeAbiParameters(
        [
          {
            type: "tuple[]",
            components: [
              { name: "chainId", type: "uint256" },
              { name: "token", type: "address" },
              { name: "vault", type: "address" },
            ],
          },
        ],
        [
          [
            {
              chainId: BigInt(this.networkConfig.chainId),
              token: this.contracts.externalIntegrations.usdcToken as Address,
              vault: this.contracts.externalIntegrations.aavePool as Address,
            },
          ],
        ]
      );
      const configHash = keccak256(configData);

      // Prepare module installation data
      const executorInstallData = encodeAbiParameters([{ type: "uint256" }], [BigInt(configHash)]);

      // Create bootstrap configurations
      const validators: any[] = [];
      const executors = [
        {
          module: this.contracts.modules.autoEarnModule.address as Address,
          data: executorInstallData,
        },
      ];
      const hook = {
        module: "0x0000000000000000000000000000000000000000" as Address,
        data: "0x" as `0x${string}`,
      };
      const fallbacks: any[] = [];
      const registryConfig = {
        registry: this.contracts.coreContracts.mockRegistry.address as Address,
        attesters: [randomAccount.address],
        threshold: 1,
      };

      // Encode the initNexus call
      const ownerData = this.account.address as `0x${string}`;

      const initNexusData = encodeFunctionData({
        abi: NEXUS_BOOTSTRAP_ABI,
        functionName: "initNexusWithDefaultValidatorAndOtherModules",
        args: [ownerData, validators, executors, hook, fallbacks, [], registryConfig],
      });

      // Create full initialization data
      const initData = encodeAbiParameters(
        [{ type: "address" }, { type: "bytes" }],
        [this.contracts.coreContracts.nexusBootstrap.address as Address, initNexusData]
      );

      // Generate salt for deterministic deployment using owner address
      const salt = keccak256(toBytes(randomAccount.address));

      // STEP 2: COMPUTE EXPECTED ACCOUNT ADDRESS
      console.log("📍 Computing expected account address...");
      const expectedAccount = (await this.publicClient.readContract({
        address: this.contracts.coreContracts.nexusAccountFactory.address as Address,
        abi: NEXUS_ACCOUNT_FACTORY_ABI,
        functionName: "computeAccountAddress",
        args: [initData, salt],
      })) as Address;

      console.log(`✅ Expected Account: ${expectedAccount}`);

      // STEP 3: SEND USDC TO EXPECTED ACCOUNT
      const transferAmount = parseUnits("0.05", 6);
      console.log(`💸 Transferring ${formatUnits(transferAmount, 6)} USDC to expected account...`);

      const transferHash = await this.walletClient.writeContract({
        address: this.contracts.externalIntegrations.usdcToken as Address,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [expectedAccount, transferAmount],
      });

      await this.publicClient.waitForTransactionReceipt({ hash: transferHash });
      console.log("✅ USDC transferred to expected account");

      // Wait to ensure transfer is confirmed
      await delay(2000);

      // STEP 4: CREATE SIGNATURE FOR AUTO EARN
      const nonce = 0n;
      // Use encodePacked to match the module's expected format: abi.encodePacked(block.chainid, token, amountToSave, nexusAccount, nonce)
      const packedData = encodePacked(
        ["uint256", "address", "uint256", "address", "uint256"],
        [
          BigInt(this.networkConfig.chainId),
          this.contracts.externalIntegrations.usdcToken as Address,
          transferAmount,
          expectedAccount,
          nonce,
        ]
      );

      const hash = keccak256(packedData);
      const autoEarnSignature = await this.account.signMessage({
        message: { raw: hexToBytes(hash) },
      });

      // STEP 5: DEPLOY + INSTALL MODULE + MODULE CALL (ATOMIC EXECUTION)
      console.log("🚀 Deploying account + installing AutoEarn module + calling autoEarn (atomic via Multicall3)...");

      const deployCall = encodeFunctionData({
        abi: BICONOMY_META_FACTORY_ABI,
        functionName: "deployWithFactory",
        args: [
          this.contracts.coreContracts.nexusAccountFactory.address as Address,
          encodeFunctionData({
            abi: NEXUS_ACCOUNT_FACTORY_ABI,
            functionName: "createAccount",
            args: [initData, salt],
          }),
        ],
      });

      const autoEarnCall = encodeFunctionData({
        abi: AUTO_EARN_ABI,
        functionName: "autoEarn",
        args: [
          this.contracts.externalIntegrations.usdcToken as Address,
          transferAmount,
          expectedAccount,
          nonce,
          autoEarnSignature,
        ],
      });

      const calls = [
        {
          target: this.contracts.coreContracts.biconomyMetaFactory.address as Address,
          allowFailure: false,
          callData: deployCall,
        },
        {
          target: this.contracts.modules.autoEarnModule.address as Address,
          allowFailure: false,
          callData: autoEarnCall,
        },
      ];

      const multicallHash = await this.walletClient.writeContract({
        address: MULTICALL3_ADDRESS,
        abi: MULTICALL3_ABI,
        functionName: "aggregate3",
        args: [calls],
        gas: 2000000n,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: multicallHash });
      console.log("✅ Account deployed, AutoEarn module installed, and funds deposited to Aave!");

      // Verify deposit
      const aUSDCBalance = await this.publicClient.readContract({
        address: this.contracts.externalIntegrations.aUSDCToken as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [expectedAccount],
      });

      console.log(`💎 Account aUSDC balance: ${formatUnits(aUSDCBalance as bigint, 6)}`);

      return {
        success: true,
        message: "Account deployed with AutoEarn module successfully",
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error("❌ AutoEarn deployment error:", error.message);
      return {
        success: false,
        message: "Failed to deploy account with AutoEarn module",
        error: error.message,
      };
    }
  }

  async deployAccountWithAutoBridge(): Promise<TestResult> {
    try {
      // Create random user wallet
      const randomAccount = privateKeyToAccount(keccak256(toBytes(Date.now().toString())));
      console.log(`👤 Random User: ${randomAccount.address}`);

      const bridgeModuleAddress = (this.contracts.modules.bridgeModule?.address ||
        this.contracts.modules.autoBridgeModule?.address) as Address;

      // STEP 1: Calculate config hash for AutoBridge module
      const destinationChainId = this.networkConfig.chainId === 421614 ? 84532 : 421614;
      const configData = encodeAbiParameters(
        [
          {
            type: "tuple[]",
            components: [
              { name: "originChainId", type: "uint256" },
              { name: "token", type: "address" },
              { name: "destinationChainId", type: "uint256" },
            ],
          },
        ],
        [
          [
            {
              originChainId: BigInt(this.networkConfig.chainId),
              token: this.contracts.externalIntegrations.usdcToken as Address,
              destinationChainId: BigInt(destinationChainId),
            },
          ],
        ]
      );
      const configHash = keccak256(configData);

      // Prepare module installation data
      const executorInstallData = encodeAbiParameters([{ type: "uint256" }], [BigInt(configHash)]);

      // Create bootstrap configurations
      const validators: any[] = [];
      const executors = [
        {
          module: bridgeModuleAddress,
          data: executorInstallData,
        },
      ];
      const hook = {
        module: "0x0000000000000000000000000000000000000000" as Address,
        data: "0x" as `0x${string}`,
      };
      const fallbacks: any[] = [];
      const registryConfig = {
        registry: this.contracts.coreContracts.mockRegistry.address as Address,
        attesters: [randomAccount.address],
        threshold: 1,
      };

      // Encode the initNexus call
      const ownerData = this.account.address as `0x${string}`;

      const initNexusData = encodeFunctionData({
        abi: NEXUS_BOOTSTRAP_ABI,
        functionName: "initNexusWithDefaultValidatorAndOtherModules",
        args: [ownerData, validators, executors, hook, fallbacks, [], registryConfig],
      });

      // Create full initialization data
      const initData = encodeAbiParameters(
        [{ type: "address" }, { type: "bytes" }],
        [this.contracts.coreContracts.nexusBootstrap.address as Address, initNexusData]
      );

      // Generate salt for deterministic deployment using owner address
      const salt = keccak256(toBytes(randomAccount.address));

      // STEP 2: COMPUTE EXPECTED ACCOUNT ADDRESS
      console.log("📍 Computing expected account address...");
      const expectedAccount = (await this.publicClient.readContract({
        address: this.contracts.coreContracts.nexusAccountFactory.address as Address,
        abi: NEXUS_ACCOUNT_FACTORY_ABI,
        functionName: "computeAccountAddress",
        args: [initData, salt],
      })) as Address;

      console.log(`✅ Expected Account: ${expectedAccount}`);

      // STEP 3: SEND USDC TO EXPECTED ACCOUNT
      const transferAmount = parseUnits("0.05", 6);
      console.log(`💸 Transferring ${formatUnits(transferAmount, 6)} USDC to expected account...`);

      const transferHash = await this.walletClient.writeContract({
        address: this.contracts.externalIntegrations.usdcToken as Address,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [expectedAccount, transferAmount],
      });

      await this.publicClient.waitForTransactionReceipt({ hash: transferHash });
      console.log("✅ USDC transferred to expected account");

      // Wait to ensure transfer is confirmed
      await delay(2000);

      // STEP 4: CREATE SIGNATURE FOR AUTO BRIDGE
      const nonce = 0n;
      const bridgeAmount = parseUnits("0.02", 6);
      const relayerFeePct = parseUnits("0.005", 18);

      // Use encodePacked to match the module's expected format: abi.encodePacked(block.chainid, amount, relayerFeePct, nexusAccount, nonce)
      const packedData = encodePacked(
        ["uint256", "uint256", "uint256", "address", "uint256"],
        [
          BigInt(this.networkConfig.chainId),
          bridgeAmount,
          relayerFeePct,
          expectedAccount,
          nonce,
        ]
      );

      const hash = keccak256(packedData);
      const autoBridgeSignature = await this.account.signMessage({
        message: { raw: hexToBytes(hash) },
      });

      // STEP 5: DEPLOY + INSTALL MODULE + MODULE CALL (ATOMIC EXECUTION)
      console.log(`🚀 Deploying account + installing AutoBridge module + calling bridge to chain ${destinationChainId} (atomic via Multicall3)...`);

      const deployCall = encodeFunctionData({
        abi: BICONOMY_META_FACTORY_ABI,
        functionName: "deployWithFactory",
        args: [
          this.contracts.coreContracts.nexusAccountFactory.address as Address,
          encodeFunctionData({
            abi: NEXUS_ACCOUNT_FACTORY_ABI,
            functionName: "createAccount",
            args: [initData, salt],
          }),
        ],
      });

      const autoBridgeCall = encodeFunctionData({
        abi: AUTO_BRIDGE_ABI,
        functionName: "bridge",
        args: [bridgeAmount, relayerFeePct, expectedAccount, nonce, autoBridgeSignature],
      });

      const calls = [
        {
          target: this.contracts.coreContracts.biconomyMetaFactory.address as Address,
          allowFailure: false,
          callData: deployCall,
        },
        {
          target: bridgeModuleAddress,
          allowFailure: false,
          callData: autoBridgeCall,
        },
      ];

      const multicallHash = await this.walletClient.writeContract({
        address: MULTICALL3_ADDRESS,
        abi: MULTICALL3_ABI,
        functionName: "aggregate3",
        args: [calls],
        gas: 2000000n,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: multicallHash });
      console.log("✅ Account deployed, AutoBridge module installed, and USDC bridged!");

      return {
        success: true,
        message: "Account deployed with AutoBridge module successfully",
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error("❌ AutoBridge deployment error:", error.message);
      return {
        success: false,
        message: "Failed to deploy account with AutoBridge module",
        error: error.message,
      };
    }
  }

  async deployAccountWithAutoSwap(): Promise<TestResult> {
    try {
      // Create random user wallet
      const randomAccount = privateKeyToAccount(keccak256(toBytes(Date.now().toString())));
      console.log(`👤 Random User: ${randomAccount.address}`);

      const swapModuleAddress = (this.contracts.modules.swapModule?.address ||
        this.contracts.modules.autoSwapModule?.address) as Address;

      // STEP 1: Calculate config hash for AutoSwap module
      const configData = encodeAbiParameters(
        [
          {
            type: "tuple[]",
            components: [
              { name: "chainId", type: "uint256" },
              { name: "defaultOutputToken", type: "address" },
              { name: "defaultPoolFee", type: "uint24" },
              { name: "slippageBps", type: "uint256" },
            ],
          },
        ],
        [
          [
            {
              chainId: BigInt(this.networkConfig.chainId),
              defaultOutputToken: this.contracts.externalIntegrations.wethToken as Address,
              defaultPoolFee: 3000,
              slippageBps: 10000n,
            },
          ],
        ]
      );
      const configHash = keccak256(configData);

      // Prepare module installation data
      const executorInstallData = encodeAbiParameters([{ type: "uint256" }], [BigInt(configHash)]);

      // Create bootstrap configurations
      const validators: any[] = [];
      const executors = [
        {
          module: swapModuleAddress,
          data: executorInstallData,
        },
      ];
      const hook = {
        module: "0x0000000000000000000000000000000000000000" as Address,
        data: "0x" as `0x${string}`,
      };
      const fallbacks: any[] = [];
      const registryConfig = {
        registry: this.contracts.coreContracts.mockRegistry.address as Address,
        attesters: [randomAccount.address],
        threshold: 1,
      };

      // Encode the initNexus call
      const ownerData = this.account.address as `0x${string}`;

      const initNexusData = encodeFunctionData({
        abi: NEXUS_BOOTSTRAP_ABI,
        functionName: "initNexusWithDefaultValidatorAndOtherModules",
        args: [ownerData, validators, executors, hook, fallbacks, [], registryConfig],
      });

      // Create full initialization data
      const initData = encodeAbiParameters(
        [{ type: "address" }, { type: "bytes" }],
        [this.contracts.coreContracts.nexusBootstrap.address as Address, initNexusData]
      );

      // Generate salt for deterministic deployment using owner address
      const salt = keccak256(toBytes(randomAccount.address));

      // STEP 2: COMPUTE EXPECTED ACCOUNT ADDRESS
      console.log("📍 Computing expected account address...");
      const expectedAccount = (await this.publicClient.readContract({
        address: this.contracts.coreContracts.nexusAccountFactory.address as Address,
        abi: NEXUS_ACCOUNT_FACTORY_ABI,
        functionName: "computeAccountAddress",
        args: [initData, salt],
      })) as Address;

      console.log(`✅ Expected Account: ${expectedAccount}`);

      // STEP 3: SEND USDC TO EXPECTED ACCOUNT
      const transferAmount = parseUnits("0.05", 6);
      console.log(`💸 Transferring ${formatUnits(transferAmount, 6)} USDC to expected account...`);

      const transferHash = await this.walletClient.writeContract({
        address: this.contracts.externalIntegrations.usdcToken as Address,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [expectedAccount, transferAmount],
      });

      await this.publicClient.waitForTransactionReceipt({ hash: transferHash });
      console.log("✅ USDC transferred to expected account");

      // Wait to ensure transfer is confirmed
      await delay(2000);

      // STEP 4: CREATE SIGNATURE FOR AUTO SWAP
      const nonce = 0n;
      const swapAmount = parseUnits("0.02", 6);

      // Use encodePacked to match the module's expected format: abi.encodePacked(block.chainid, inputToken, amountIn, nexusAccount, nonce)
      const packedData = encodePacked(
        ["uint256", "address", "uint256", "address", "uint256"],
        [
          BigInt(this.networkConfig.chainId),
          this.contracts.externalIntegrations.usdcToken as Address,
          swapAmount,
          expectedAccount,
          nonce,
        ]
      );

      const hash = keccak256(packedData);
      const autoSwapSignature = await this.account.signMessage({
        message: { raw: hexToBytes(hash) },
      });

      // STEP 5: DEPLOY + INSTALL MODULE + MODULE CALL (ATOMIC EXECUTION)
      console.log("🚀 Deploying account + installing AutoSwap module + calling swap USDC to WETH (atomic via Multicall3)...");

      const deployCall = encodeFunctionData({
        abi: BICONOMY_META_FACTORY_ABI,
        functionName: "deployWithFactory",
        args: [
          this.contracts.coreContracts.nexusAccountFactory.address as Address,
          encodeFunctionData({
            abi: NEXUS_ACCOUNT_FACTORY_ABI,
            functionName: "createAccount",
            args: [initData, salt],
          }),
        ],
      });

      const autoSwapCall = encodeFunctionData({
        abi: AUTO_SWAP_ABI,
        functionName: "swap",
        args: [
          this.contracts.externalIntegrations.usdcToken as Address,
          swapAmount,
          expectedAccount,
          nonce,
          autoSwapSignature,
        ],
      });

      const calls = [
        {
          target: this.contracts.coreContracts.biconomyMetaFactory.address as Address,
          allowFailure: false,
          callData: deployCall,
        },
        {
          target: swapModuleAddress,
          allowFailure: false,
          callData: autoSwapCall,
        },
      ];

      const multicallHash = await this.walletClient.writeContract({
        address: MULTICALL3_ADDRESS,
        abi: MULTICALL3_ABI,
        functionName: "aggregate3",
        args: [calls],
        gas: 2000000n,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: multicallHash });
      console.log("✅ Account deployed, AutoSwap module installed, and tokens swapped!");

      return {
        success: true,
        message: "Account deployed with AutoSwap module successfully",
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error("❌ AutoSwap deployment error:", error.message);
      return {
        success: false,
        message: "Failed to deploy account with AutoSwap module",
        error: error.message,
      };
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 Biconomy Nexus Module Testing with Viem");
  console.log("=".repeat(80));

  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("❌ Error: PRIVATE_KEY environment variable is required");
    console.error("   Set it with: export PRIVATE_KEY=0x...");
    process.exit(1);
  }

  console.log("✅ Private key loaded");

  const allResults: ModuleTestResult[] = [];

  // Test on both networks
  for (const [networkKey, networkConfig] of Object.entries(NETWORKS)) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🌐 Testing on ${networkConfig.name}`);
    console.log(`${"=".repeat(80)}`);

    try {
      const tester = new ViemModuleTester(networkKey as keyof typeof NETWORKS, privateKey);
      const results = await tester.testAllModules();
      allResults.push(...results);
    } catch (error: any) {
      console.error(`❌ Error testing ${networkKey}:`, error.message);
    }
  }

  // Generate summary report
  console.log(`\n${"=".repeat(80)}`);
  console.log("📊 TEST SUMMARY REPORT");
  console.log(`${"=".repeat(80)}`);

  const summary = {
    totalTests: allResults.length,
    passedTests: 0,
    failedTests: 0,
    timestamp: new Date().toISOString(),
    networkResults: {} as any,
  };

  for (const result of allResults) {
    const networkKey = result.network.toLowerCase().replace(" ", "");
    if (!summary.networkResults[networkKey]) {
      summary.networkResults[networkKey] = {
        total: 0,
        passed: 0,
        failed: 0,
        modules: [],
      };
    }

    summary.networkResults[networkKey].total++;
    summary.networkResults[networkKey].modules.push(result.moduleName);

    const modulePassed =
      result.tests.deployment.success && result.tests.configuration.success && result.tests.functionality.success;

    if (modulePassed) {
      summary.passedTests++;
      summary.networkResults[networkKey].passed++;
      console.log(`✅ ${result.network} - ${result.moduleName}: PASSED`);
    } else {
      summary.failedTests++;
      summary.networkResults[networkKey].failed++;
      console.log(`❌ ${result.network} - ${result.moduleName}: FAILED`);

      if (!result.tests.deployment.success) {
        console.log(`   └─ Deployment: ${result.tests.deployment.message}`);
      }
      if (!result.tests.configuration.success) {
        console.log(`   └─ Configuration: ${result.tests.configuration.message}`);
      }
      if (!result.tests.functionality.success) {
        console.log(`   └─ Functionality: ${result.tests.functionality.message}`);
        if (result.tests.functionality.error) {
          console.log(`      Error: ${result.tests.functionality.error}`);
        }
      }
    }
  }

  console.log(`\n📈 Overall Results:`);
  console.log(`   Total Tests: ${summary.totalTests}`);
  console.log(`   ✅ Passed: ${summary.passedTests}`);
  console.log(`   ❌ Failed: ${summary.failedTests}`);
  console.log(`   📊 Success Rate: ${((summary.passedTests / summary.totalTests) * 100).toFixed(1)}%`);

  // Save detailed results to file
  const resultsPath = path.join(__dirname, "../../test-results-viem.json");
  const fullResults = {
    summary,
    detailedResults: allResults,
  };

  fs.writeFileSync(resultsPath, JSON.stringify(fullResults, null, 2));
  console.log(`\n💾 Detailed results saved to: ${resultsPath}`);

  // Exit with appropriate code
  if (summary.failedTests > 0) {
    console.log("\n⚠️  Some tests failed. Review the results above.");
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed successfully!");
    process.exit(0);
  }
}

// Run the main function
main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});