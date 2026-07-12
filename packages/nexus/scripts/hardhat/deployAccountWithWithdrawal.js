const ethers = require("ethers");
const fs = require("fs");
const path = require("path");

// Load deployment data
const deploymentsPath = path.join(__dirname, "../../deployments.json");
const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

// Constants
const USDC_ADDRESS = deployments.configuration.usdcToken;
const AAVE_POOL_ADDRESS = "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b";
const AAVE_USDC_ADDRESS = deployments.configuration.aUSDCToken;
const ENTRYPOINT_ADDRESS = deployments.configuration.entryPoint;
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const TRANSFER_AMOUNT = ethers.parseUnits("0.00001", 6); // 0.01 USDC (6 decimals)

// Contract ABIs
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const AAVE_POOL_ABI = [
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
];

const NEXUS_ACCOUNT_ABI = [
  // EntryPoint will call executeUserOp, which delegatecalls into this selector with our calldata
  "function execute(bytes32 mode, bytes executionCalldata) external payable",
  "function getNonce() external view returns (uint256)",
];

const PACKED_USER_OP_COMPONENTS = [
  { name: "sender", type: "address" },
  { name: "nonce", type: "uint256" },
  { name: "initCode", type: "bytes" },
  { name: "callData", type: "bytes" },
  { name: "accountGasLimits", type: "bytes32" },
  { name: "preVerificationGas", type: "uint256" },
  { name: "gasFees", type: "bytes32" },
  { name: "paymasterAndData", type: "bytes" },
  { name: "signature", type: "bytes" },
];

const ENTRYPOINT_ABI = [
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getUserOpHash",
    stateMutability: "view",
    inputs: [
      {
        name: "userOp",
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "accountGasLimits", type: "bytes32" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "gasFees", type: "bytes32" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "handleOps",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "ops",
        type: "tuple[]",
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "accountGasLimits", type: "bytes32" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "gasFees", type: "bytes32" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
      { name: "beneficiary", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "depositTo",
    stateMutability: "payable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
];

const K1_VALIDATOR_ABI = [
  "function isInitialized(address smartAccount) external view returns (bool)",
  "function getOwner(address account) external view returns (address)",
];

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[] returnData)",
];

const NEXUS_ACCOUNT_FACTORY_ABI = [
  "function computeAccountAddress(bytes calldata initData, bytes32 salt) external view returns (address)",
  "function createAccount(bytes calldata initData, bytes32 salt) external returns (address)",
];

const BICONOMY_META_FACTORY_ABI = [
  "function deployWithFactory(address factory, bytes calldata initData) external returns (address)",
];

const NEXUS_BOOTSTRAP_ABI = [
  {
    type: "function",
    name: "initNexusWithDefaultValidatorAndOtherModules",
    stateMutability: "payable",
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
    outputs: [],
  },
];

const AUTO_EARN_ABI = [
  "function autoEarn(address token, uint256 amount, address nexusAccount, uint256 nonce, bytes calldata signature) external",
  "function isInitialized(address account) external view returns (bool)",
];

// Helper: send a tx with a fresh nonce, retry once on NONCE_EXPIRED
async function sendWithFreshNonce(signer, txReq) {
  try {
    const nonce = await signer.getNonce("pending");
    return await signer.sendTransaction({ ...txReq, nonce });
  } catch (e) {
    if (e && e.code === "NONCE_EXPIRED") {
      const nonce = await signer.getNonce("latest");
      return await signer.sendTransaction({ ...txReq, nonce });
    }
    throw e;
  }
}

async function main() {
  console.log(
    "=== Complete UserOp Flow: Deploy, Deposit, Withdraw with Sponsorship ===\n",
  );

  // Setup provider
  const provider = new ethers.JsonRpcProvider(
    process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
  );

  // Relayer wallet (pays for gas)
  const relayerWallet = new ethers.Wallet(
    process.env.PRIVATE_KEY ||
      "0x7cf73cff18de223ccfc1188c034f639768a90fd628393d0538fdb54d62b64695",
    provider,
  );
  console.log("Relayer Address:", relayerWallet.address);

  // Create random user wallet
  const userWallet = ethers.Wallet.createRandom().connect(provider);
  console.log("Random User Address:", userWallet.address);
  console.log("User Private Key:", userWallet.privateKey);

  // Get contract instances
  const nexusAccountFactory = new ethers.Contract(
    deployments.coreContracts.nexusAccountFactory,
    NEXUS_ACCOUNT_FACTORY_ABI,
    provider,
  );

  const biconomyMetaFactory = new ethers.Contract(
    deployments.coreContracts.biconomyMetaFactory,
    BICONOMY_META_FACTORY_ABI,
    relayerWallet,
  );

  const autoEarnModule = new ethers.Contract(
    deployments.modules.autoEarnModule,
    AUTO_EARN_ABI,
    relayerWallet,
  );

  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, relayerWallet);
  const aUSDC = new ethers.Contract(AAVE_USDC_ADDRESS, ERC20_ABI, provider);
  const multicall3 = new ethers.Contract(
    MULTICALL3_ADDRESS,
    MULTICALL3_ABI,
    relayerWallet,
  );
  const entryPoint = new ethers.Contract(
    ENTRYPOINT_ADDRESS,
    ENTRYPOINT_ABI,
    relayerWallet,
  );

  // Load paymaster from deployments
  const PAYMASTER_ADDRESS = deployments.paymaster;
  if (!PAYMASTER_ADDRESS || PAYMASTER_ADDRESS === ethers.ZeroAddress) {
    throw new Error("Paymaster address missing in deployments.json");
  }
  const VERIFYING_PAYMASTER_ABI = [
    {
      type: "function",
      name: "getHash",
      stateMutability: "view",
      inputs: [
        {
          name: "userOp",
          type: "tuple",
          components: PACKED_USER_OP_COMPONENTS,
        },
        { name: "validUntil", type: "uint48" },
        { name: "validAfter", type: "uint48" },
      ],
      outputs: [{ name: "", type: "bytes32" }],
    },
    {
      type: "function",
      name: "verifyingSigner",
      stateMutability: "view",
      inputs: [],
      outputs: [{ name: "", type: "address" }],
    },
  ];
  const paymaster = new ethers.Contract(
    PAYMASTER_ADDRESS,
    VERIFYING_PAYMASTER_ABI,
    relayerWallet,
  );
  // Optional dedicated paymaster signer (must match paymaster.verifyingSigner())
  const pmSignerPk = process.env.PAYMASTER_SIGNER_PK || null;
  const configuredSigner = await (async () => {
    try {
      return await new ethers.Contract(
        PAYMASTER_ADDRESS,
        [
          {
            type: "function",
            name: "verifyingSigner",
            stateMutability: "view",
            inputs: [],
            outputs: [{ name: "", type: "address" }],
          },
        ],
        provider,
      ).verifyingSigner();
    } catch {
      return null;
    }
  })();
  const pmSigner = pmSignerPk
    ? new ethers.Wallet(pmSignerPk, provider)
    : relayerWallet;
  if (
    configuredSigner &&
    configuredSigner.toLowerCase() !== pmSigner.address.toLowerCase()
  ) {
    console.error("[FATAL] Paymaster verifyingSigner mismatch.");
    console.error("verifyingSigner:", configuredSigner);
    console.error("signing with:", pmSigner.address);
    console.error(
      "Set PAYMASTER_SIGNER_PK to the private key of verifyingSigner or update paymaster.",
    );
    process.exit(1);
  }
  const k1Validator = new ethers.Contract(
    deployments.coreContracts.k1Validator,
    K1_VALIDATOR_ABI,
    provider,
  );

  // Check relayer USDC balance
  const relayerBalance = await usdc.balanceOf(relayerWallet.address);
  console.log("Relayer USDC balance:", ethers.formatUnits(relayerBalance, 6));

  if (relayerBalance < TRANSFER_AMOUNT) {
    throw new Error("Insufficient USDC balance");
  }

  console.log("\n--- Step 1: Computing Account Address for Random User ---");

  // Calculate config hash for AutoEarn module
  const configData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint256 chainId, address token, address vault)[]"],
    [
      [
        {
          chainId: 84532,
          token: USDC_ADDRESS,
          vault: AAVE_POOL_ADDRESS,
        },
      ],
    ],
  );
  const configHash = ethers.keccak256(configData);

  // Prepare module installation data
  const executorInstallData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256"],
    [configHash],
  );

  // Create bootstrap configurations with the random user as owner
  const validators = []; // K1Validator is installed by default
  const executors = [[deployments.modules.autoEarnModule, executorInstallData]];
  const hook = [ethers.ZeroAddress, "0x"];
  const fallbacks = [];
  const preValidationHooks = [];
  const registryConfig = [
    deployments.coreContracts.mockRegistry,
    [userWallet.address], // User as attester/owner
    1,
  ];

  // Encode the initNexus call via ABI (no hardcoded selector)
  const ownerData = ethers.getBytes(relayerWallet.address); // abi.encodePacked(address)
  const nexusBootstrap = new ethers.Interface(NEXUS_BOOTSTRAP_ABI);
  const initNexusData = nexusBootstrap.encodeFunctionData(
    "initNexusWithDefaultValidatorAndOtherModules",
    [
      ownerData,
      validators.map(([module, data]) => ({ module, data })),
      executors.map(([module, data]) => ({ module, data })),
      { module: hook[0], data: hook[1] },
      fallbacks.map(([module, data]) => ({ module, data })),
      [],
      {
        registry: registryConfig[0],
        attesters: registryConfig[1],
        threshold: registryConfig[2],
      },
    ],
  );

  // Create full initialization data
  const initData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes"],
    [deployments.coreContracts.nexusBootstrap, initNexusData],
  );

  // Generate salt for deterministic deployment
  const salt = ethers.keccak256(
    ethers.toUtf8Bytes("user-account-" + Date.now()),
  );

  // Calculate the expected account address
  const expectedAccount = await nexusAccountFactory.computeAccountAddress(
    initData,
    salt,
  );
  console.log("Expected Account Address:", expectedAccount);

  console.log("\n--- Step 2: Funding Account and Deploying with AutoEarn ---");

  // Transfer USDC to expected account
  console.log("Transferring 0.00001 USDC to account...");
  const transferTx = await usdc.transfer(expectedAccount, TRANSFER_AMOUNT);
  await transferTx.wait();
  console.log("USDC transferred successfully");

  // Create signature for AutoEarn (signed by relayer as authorized)
  const nonce = 0;
  const packedData = ethers.solidityPacked(
    ["uint256", "address", "uint256", "address", "uint256"],
    [84532, USDC_ADDRESS, TRANSFER_AMOUNT, expectedAccount, nonce],
  );
  const hash = ethers.keccak256(packedData);
  const autoEarnSignature = await relayerWallet.signMessage(
    ethers.getBytes(hash),
  );

  // Prepare factory call data
  const factoryCallData = nexusAccountFactory.interface.encodeFunctionData(
    "createAccount",
    [initData, salt],
  );

  // Deploy account and execute AutoEarn atomically
  const calls = [
    {
      target: deployments.coreContracts.biconomyMetaFactory,
      allowFailure: false,
      callData: biconomyMetaFactory.interface.encodeFunctionData(
        "deployWithFactory",
        [deployments.coreContracts.nexusAccountFactory, factoryCallData],
      ),
    },
    {
      target: deployments.modules.autoEarnModule,
      allowFailure: false,
      callData: autoEarnModule.interface.encodeFunctionData("autoEarn", [
        USDC_ADDRESS,
        TRANSFER_AMOUNT,
        expectedAccount,
        nonce,
        autoEarnSignature,
      ]),
    },
  ];

  console.log("Deploying account and depositing to Aave...");
  const deployTx = await multicall3.aggregate3(calls, { gasLimit: 2000000 });
  const deployReceipt = await deployTx.wait();
  console.log("Account deployed and funds deposited to Aave!");
  console.log("Deploy Tx Hash:", deployReceipt.hash);

  // Verify deployment
  const aUSDCBalance = await aUSDC.balanceOf(expectedAccount);
  console.log("Account aUSDC balance:", ethers.formatUnits(aUSDCBalance, 6));

  // Get the deployed account instance
  const nexusAccount = new ethers.Contract(
    expectedAccount,
    NEXUS_ACCOUNT_ABI,
    provider,
  );

  console.log(
    "\n--- Step 3: Creating Batch UserOp (Withdraw + Transfer, sponsored by Paymaster) ---",
  );

  // Prepare individual call datas
  // Execution = (address target, uint256 value, bytes callData)
  const aavePool = new ethers.Contract(
    AAVE_POOL_ADDRESS,
    AAVE_POOL_ABI,
    provider,
  );
  const aUsdcBalance = await aUSDC.balanceOf(expectedAccount);
  console.log("aUSDC balance:", aUsdcBalance.toString());
  const withdrawCalldata = aavePool.interface.encodeFunctionData("withdraw", [
    USDC_ADDRESS,
    aUsdcBalance,
    expectedAccount,
  ]);
  const transferCalldata = usdc.interface.encodeFunctionData("transfer", [
    relayerWallet.address,
    TRANSFER_AMOUNT,
  ]);

  // Encode batch per ExecLib.encodeBatch: abi.encode(Execution[])
  const executions = [
    { target: AAVE_POOL_ADDRESS, value: 0n, callData: withdrawCalldata },
    { target: USDC_ADDRESS, value: 0n, callData: transferCalldata },
  ];
  const executionsEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address target,uint256 value,bytes callData)[]"],
    [executions],
  );

  // ModeLib.encodeSimpleBatch => bytes32 constructed as: CALLTYPE_BATCH | EXECTYPE_DEFAULT | MODE_DEFAULT | UNUSED | MODE_PAYLOAD
  const modeSimpleBatch = ethers.concat([
    "0x01", // CALLTYPE_BATCH
    "0x00", // EXECTYPE_DEFAULT
    "0x00000000", // MODE_DEFAULT
    "0x00000000", // UNUSED
    "0x00000000000000000000000000000000000000000000", // MODE_PAYLOAD (22 bytes)
  ]);

  const executeCalldataBatch = nexusAccount.interface.encodeFunctionData(
    "execute",
    [modeSimpleBatch, executionsEncoded],
  );

  // Get account nonce for UserOp (match Solidity: ep.getNonce(account, 0))
  const accountNonce = await entryPoint.getNonce(expectedAccount, 0);

  // Assemble PackedUserOperation with Paymaster sponsorship
  // Keep gas values well under uint160 and bundler constraints
  const callGasLimit = 800_000n;
  const verificationGasLimit = 800_000n;
  const preVerificationGas = 120_000n;
  const maxFeePerGas = ethers.parseUnits("5", "gwei");
  const maxPriorityFeePerGas = ethers.parseUnits("2", "gwei");

  // Pack as bytes32 using uint128 order matching working Solidity: [verificationGasLimit, callGasLimit]
  const accountGasLimitsBytes32 = ethers.solidityPacked(
    ["uint128", "uint128"],
    [verificationGasLimit, callGasLimit],
  );
  // Pack gas fees as [maxPriorityFeePerGas, maxFeePerGas]
  const gasFeesBytes32 = ethers.solidityPacked(
    ["uint128", "uint128"],
    [maxPriorityFeePerGas, maxFeePerGas],
  );

  // paymaster time bounds: avoid clock drift by using open start (validAfter=0)
  const nowTs = BigInt(Math.floor(Date.now() / 1000));
  const validAfter = 0n;
  const validUntil = nowTs + 7n * 24n * 60n * 60n; // +7 days
  const emptyPmSig = "0x" + "00".repeat(65);
  const pmValidationGasLimit = 800_000n; // match Solidity
  const pmPostOpGasLimit = 300_000n; // match Solidity
  const timeRangeEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint48", "uint48"],
    [validUntil, validAfter],
  );

  // Precompute paymasterAndData (packed) with empty signature for hashing (for VerifyingPaymaster)
  let paymasterAndData = ethers.solidityPacked(
    ["address", "uint128", "uint128", "bytes", "bytes"],
    [
      PAYMASTER_ADDRESS,
      pmValidationGasLimit,
      pmPostOpGasLimit,
      timeRangeEncoded,
      emptyPmSig,
    ],
  );

  // Skip deposit; paymaster is assumed funded

  // Packed struct for VerifyingPaymaster.getHash
  const pmOpPacked = {
    sender: expectedAccount,
    nonce: accountNonce,
    initCode: "0x",
    callData: executeCalldataBatch,
    accountGasLimits: accountGasLimitsBytes32,
    preVerificationGas: preVerificationGas,
    gasFees: gasFeesBytes32,
    paymasterAndData: paymasterAndData,
    signature: emptyPmSig, // match Solidity: 65-byte empty signature for hashing
  };

  // Sign paymaster data using on-chain getHash to avoid client mismatch
  const pmHashOnChain = await paymaster.getHash(
    pmOpPacked,
    Number(validUntil),
    Number(validAfter),
  );
  const pmHashBytes = ethers.getBytes(pmHashOnChain);
  // Sign and re-encode as (r || s || v) to match Solidity's abi.encodePacked(r,s,v)
  const rawSig = await pmSigner.signMessage(pmHashBytes);
  const { r: pmR, s: pmS, v: pmV } = ethers.Signature.from(rawSig);
  const pmSig = ethers.concat([pmR, pmS, ethers.toBeHex(pmV, 1)]);
  try {
    const recovered = ethers.recoverAddress(
      ethers.hashMessage(pmHashBytes),
      rawSig,
    );
    const signerOnChain = await paymaster.verifyingSigner();
    console.log(
      "[DEBUG] Paymaster signer:",
      signerOnChain,
      "recovered:",
      recovered,
      "sigBy:",
      pmSigner.address,
    );
    console.log("[DEBUG] pmHash(sol):", pmHashOnChain);
  } catch {}

  // Rebuild paymasterAndData (packed) with real signature
  paymasterAndData = ethers.solidityPacked(
    ["address", "uint128", "uint128", "bytes", "bytes"],
    [
      PAYMASTER_ADDRESS,
      pmValidationGasLimit,
      pmPostOpGasLimit,
      timeRangeEncoded,
      pmSig,
    ],
  );

  // Packed struct for EntryPoint v0.6 (bytes32 gas fields)
  let userOp = {
    sender: expectedAccount,
    nonce: accountNonce,
    initCode: "0x",
    callData: executeCalldataBatch,
    accountGasLimits: accountGasLimitsBytes32,
    preVerificationGas: preVerificationGas,
    gasFees: gasFeesBytes32,
    paymasterAndData: paymasterAndData,
    signature: "0x",
  };

  // Debug: log the userOp before hashing/sending
  {
    const aglHex = ethers.hexlify(userOp.accountGasLimits);
    const gfHex = ethers.hexlify(userOp.gasFees);
    const aglBI = BigInt(aglHex);
    const gfBI = BigInt(gfHex);
    const vglBI = aglBI >> 128n;
    const cglBI = aglBI & ((1n << 128n) - 1n);
    const mpBI = gfBI >> 128n; // maxPriorityFeePerGas
    const mfBI = gfBI & ((1n << 128n) - 1n); // maxFeePerGas
    console.log("\n[DEBUG] EntryPoint userOp about to send:");
    console.log({
      sender: userOp.sender,
      nonce: userOp.nonce.toString(),
      initCodeLen: userOp.initCode.length,
      callDataLen: userOp.callData.length,
      accountGasLimits: aglHex,
      verificationGasLimit_decoded: vglBI.toString(),
      callGasLimit_decoded: cglBI.toString(),
      preVerificationGas: userOp.preVerificationGas.toString(),
      gasFees: gfHex,
      maxPriorityFeePerGas_decoded: mpBI.toString(),
      maxFeePerGas_decoded: mfBI.toString(),
      paymasterAndDataLen: userOp.paymasterAndData.length,
    });
  }

  // Compute userOpHash for account signature
  const userOpHash = await entryPoint.getUserOpHash(userOp);
  console.log("UserOp Hash:", userOpHash);
  // Sign with account owner (relayer) and validate against K1Validator
  const toSign = ethers.getBytes(userOpHash);
  const userSig = await relayerWallet.signMessage(toSign);
  // Recover and compare with validator owner
  let recoveredAddr;
  try {
    recoveredAddr = ethers.recoverAddress(ethers.hashMessage(toSign), userSig);
  } catch (e) {
    console.error("[FATAL] Failed to recover signer from signature:", e);
    process.exit(1);
  }
  const configuredOwner = await k1Validator.getOwner(expectedAccount);
  console.log("Configured K1 owner:", configuredOwner);
  console.log("Recovered from signature:", recoveredAddr);
  console.log("Relayer address:", relayerWallet.address);
  // Optional: surface initialization state if available
  try {
    const isInit = await k1Validator.isInitialized(expectedAccount);
    console.log("K1Validator initialized:", isInit);
  } catch {}
  if (configuredOwner.toLowerCase() !== recoveredAddr.toLowerCase()) {
    console.error("[FATAL] Signature not by configured owner");
    process.exit(1);
  }
  userOp.signature = userSig;
  console.log("UserOp signed and validated against K1Validator");

  console.log(
    "\n--- Step 4: Submitting Batch UserOp (Paymaster sponsors gas) ---",
  );
  const handleOpsCalldata = entryPoint.interface.encodeFunctionData(
    "handleOps",
    [[userOp], relayerWallet.address],
  );
  const handleOpsTx = await sendWithFreshNonce(relayerWallet, {
    to: ENTRYPOINT_ADDRESS,
    data: handleOpsCalldata,
  });
  const handleOpsReceipt = await handleOpsTx.wait();
  console.log("Batch UserOp (withdraw + transfer) executed successfully!");
  console.log("Execution Tx Hash:", handleOpsReceipt.hash);

  console.log("\n--- Step 5: Verifying Results ---");

  // Check final balances
  const finalAccountUSDC = await usdc.balanceOf(expectedAccount);
  const finalAccountAUSDC = await aUSDC.balanceOf(expectedAccount);
  const finalRelayerUSDC = await usdc.balanceOf(relayerWallet.address);

  console.log(
    "Final Account USDC balance:",
    ethers.formatUnits(finalAccountUSDC, 6),
  );
  console.log(
    "Final Account aUSDC balance:",
    ethers.formatUnits(finalAccountAUSDC, 6),
  );
  console.log(
    "Final Relayer USDC balance:",
    ethers.formatUnits(finalRelayerUSDC, 6),
  );

  console.log("\n=== Complete Flow Summary ===");
  console.log("1. Created random user:", userWallet.address);
  console.log("2. Deployed account:", expectedAccount);
  console.log("3. Deposited 0.01 USDC to Aave via AutoEarn");
  console.log("4. User signed UserOp for withdrawal");
  console.log("5. Paymaster sponsored execution:", PAYMASTER_ADDRESS);
  console.log("6. Funds returned to relayer");

  // Save deployment info
  const flowData = {
    timestamp: new Date().toISOString(),
    user: userWallet.address,
    userPrivateKey: userWallet.privateKey,
    account: expectedAccount,
    relayer: relayerWallet.address,
    deployTxHash: deployReceipt.hash,
    executionTxHash: handleOpsReceipt.hash,
    salt: salt,
  };

  const flowFile = path.join(__dirname, "../../user-flows.json");
  let flows = [];
  if (fs.existsSync(flowFile)) {
    flows = JSON.parse(fs.readFileSync(flowFile, "utf8"));
  }
  flows.push(flowData);
  fs.writeFileSync(flowFile, JSON.stringify(flows, null, 2));
  console.log("\nFlow data saved to user-flows.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:");
    console.error(error);
    process.exit(1);
  });
