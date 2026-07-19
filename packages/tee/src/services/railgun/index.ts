// Railgun shielded-pool integration (shield -> unshield) for the /private-route hub.
//
// Runs IN-PROCESS on Node using @railgun-community/wallet + ethers v6.
//
// DEGRADABLE BY DESIGN: the engine only initializes when fully configured
// (RAILGUN_POI_NODE_URL + RAILGUN_MNEMONIC + RAILGUN_ENCRYPTION_KEY, and a
// reachable POI aggregator node). If it isn't configured — or init fails — the
// service stays disabled, the TEE still boots, and shield/unshield throw a clear
// "not ready" error the orchestrator treats as a pause (route stays retryable).
//
// The exact init sequence (validated during the spike): startRailgunEngine with
// a live POI node URL -> loadProvider (FallbackProviderJsonConfig, totalWeight>=2)
// -> createRailgunWallet/loadWalletByID.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from '../../managers/log';
import { chainManager } from '../../managers/chain';

// Heavy WASM SDK — dynamically imported only when configured (keeps boot light when disabled).
type RailgunWalletSDK = typeof import('@railgun-community/wallet');
let RG: RailgunWalletSDK | null = null;

let initAttempted = false;
let engineReady = false;
let railgunWalletId: string | null = null;
let railgunAddress: string | null = null;

interface RailgunConfig {
  poiNodeURLs: string[];
  mnemonic: string;
  encryptionKey: string;
  dbPath: string;
  artifactPath: string;
}

function readConfig(): RailgunConfig | null {
  const poiNodeURLs = (process.env.RAILGUN_POI_NODE_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const mnemonic = process.env.RAILGUN_MNEMONIC || '';
  const encryptionKey = process.env.RAILGUN_ENCRYPTION_KEY || '';
  if (poiNodeURLs.length === 0 || !mnemonic || !encryptionKey) return null;
  return {
    poiNodeURLs,
    mnemonic,
    encryptionKey,
    dbPath: process.env.RAILGUN_DB_PATH || join(process.cwd(), 'data', 'railgun.db'),
    artifactPath: process.env.RAILGUN_ARTIFACT_PATH || join(process.cwd(), 'data', 'railgun-artifacts'),
  };
}

export function isRailgunConfigured(): boolean {
  return readConfig() !== null;
}

/** Quick reachability check for the configured POI aggregator node(s). */
async function poiNodeReachable(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    const base = url.replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/node-status-v2`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      // try the next url
    }
  }
  return false;
}

export function isRailgunReady(): boolean {
  return engineReady;
}

export function getRailgunAddress(): string | null {
  return railgunAddress;
}

function buildArtifactStore(ArtifactStore: RailgunWalletSDK['ArtifactStore'], root: string) {
  // The store's callbacks must return Promises but the fs ops are sync, so we
  // wrap in Promise.resolve rather than marking them async (which would be a
  // no-await lint error).
  return new ArtifactStore(
    (path: string) => {
      const p = join(root, path);
      return Promise.resolve(existsSync(p) ? readFileSync(p) : null);
    },
    (_dir: string, path: string, item: string | Uint8Array) => {
      const p = join(root, path);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, item as NodeJS.ArrayBufferView | string);
      return Promise.resolve();
    },
    (path: string) => Promise.resolve(existsSync(join(root, path)))
  );
}

/** Build a Railgun FallbackProviderJsonConfig for a chain (totalWeight must be >= 2). */
function providerConfigForChain(chainId: number): { chainId: number; providers: Array<{ provider: string; priority: number; weight: number; maxLogsPerBatch: number }> } | null {
  // Prefer an explicit Railgun RPC env, else the chain config url, else nothing.
  const envRpc = process.env[`RAILGUN_RPC_${chainId}`] || process.env[`RPC_${chainId}`];
  const chain = chainManager.getChain(chainId);
  const chainUrl = chain && (chain as unknown as { url?: string }).url;
  const primary = envRpc || (chainUrl && chainUrl.length > 0 ? chainUrl : undefined);
  if (!primary) return null;
  const backup = process.env[`RAILGUN_RPC_${chainId}_BACKUP`] || primary;
  return {
    chainId,
    providers: [
      { provider: primary, priority: 1, weight: 1, maxLogsPerBatch: 10 },
      { provider: backup, priority: 2, weight: 1, maxLogsPerBatch: 10 },
    ],
  };
}

/**
 * Initialize the Railgun engine + wallet for the given hub chain. Idempotent and
 * NON-FATAL: logs and returns without throwing if unconfigured or on failure.
 */
export async function initRailgunEngine(hubChainId: number): Promise<void> {
  if (initAttempted) return;
  initAttempted = true;

  const config = readConfig();
  if (!config) {
    logger.warn(
      'Railgun not configured (need RAILGUN_POI_NODE_URL + RAILGUN_MNEMONIC + RAILGUN_ENCRYPTION_KEY); privacy leg disabled.',
      'Railgun'
    );
    return;
  }

  // Fail fast + clearly if the POI node can't be reached, instead of a vague
  // engine init error later. Run your own node: see infra/poi-node.
  if (!(await poiNodeReachable(config.poiNodeURLs))) {
    logger.warn(
      `Railgun: POI node unreachable at [${config.poiNodeURLs.join(', ')}]; privacy leg disabled (routes pause at shield). Start one (infra/poi-node) and set RAILGUN_POI_NODE_URL.`,
      'Railgun'
    );
    return;
  }

  try {
    const sdk = await import('@railgun-community/wallet');
    const sharedModels = await import('@railgun-community/shared-models');
    const levelMod = await import('level');
    RG = sdk;

    const { startRailgunEngine, loadProvider, createRailgunWallet, ArtifactStore } = sdk;
    const Level = (levelMod as unknown as { Level?: unknown; default?: unknown }).Level ?? (levelMod as unknown as { default: unknown }).default;

    mkdirSync(dirname(config.dbPath), { recursive: true });
    const db = new (Level as new (path: string) => unknown)(config.dbPath);
    const artifactStore = buildArtifactStore(ArtifactStore, config.artifactPath);

    // skipMerkletreeScans=false: we need shielded balances to unshield.
    await startRailgunEngine(
      'erebuztee',
      db as never,
      false,
      artifactStore,
      false, // useNativeArtifacts (false for nodejs)
      false, // skipMerkletreeScans
      config.poiNodeURLs,
      [],
      false
    );

    const providerConfig = providerConfigForChain(hubChainId);
    if (!providerConfig) {
      logger.warn(
        `Railgun: no RPC configured for hub chain ${hubChainId} (set RAILGUN_RPC_${hubChainId} or the chain config url); privacy leg disabled.`,
        'Railgun'
      );
      return;
    }

    const networkName = networkNameForChain(sharedModels, hubChainId);
    if (!networkName) {
      logger.warn(`Railgun: unsupported hub chain ${hubChainId}; privacy leg disabled.`, 'Railgun');
      return;
    }

    await loadProvider(providerConfig, networkName, 1000 * 60 * 5);

    const walletInfo = await createRailgunWallet(config.encryptionKey, config.mnemonic, undefined);
    railgunWalletId = walletInfo.id;
    railgunAddress = walletInfo.railgunAddress;
    engineReady = true;
    logger.info(`Railgun engine ready; wallet ${railgunWalletId} (${String(railgunAddress).slice(0, 24)}...)`, 'Railgun');
  } catch (error) {
    engineReady = false;
    logger.error('Railgun engine init failed; privacy leg disabled (route will pause at shield step)', 'Railgun', error);
  }
}

function networkNameForChain(
  sharedModels: typeof import('@railgun-community/shared-models'),
  chainId: number
): import('@railgun-community/shared-models').NetworkName | null {
  const { NetworkName } = sharedModels;
  // Only the mainnets this SDK version actually supports. Anything else returns
  // null, and the caller keeps the privacy leg disabled rather than shielding on
  // the wrong network. (Base is intentionally absent — not a Railgun network in
  // @railgun-community/shared-models@7.x. The hub is Arbitrum by default.)
  const map: Record<number, import('@railgun-community/shared-models').NetworkName> = {
    1: NetworkName.Ethereum,
    56: NetworkName.BNBChain,
    137: NetworkName.Polygon,
    42161: NetworkName.Arbitrum,
  };
  return map[chainId] ?? null;
}

function assertReady(): RailgunWalletSDK {
  if (!engineReady || !RG || !railgunWalletId) {
    throw new Error('Railgun not ready (privacy leg disabled — configure RAILGUN_POI_NODE_URL and a reachable POI node)');
  }
  return RG;
}

export interface ShieldCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

/**
 * Build the [approve, shield] calls needed to shield `amount` of `tokenAddress`
 * into our Railgun wallet. These are executed FROM the hub smart account as a
 * single batched UserOperation (see services/aa) — the SA holds the tokens.
 *
 * The shield private key (which encrypts the note) is derived from the TEE
 * signer and is independent of who submits the tx, so the SA can execute it.
 */
export async function buildShieldCalls(params: {
  chainId: number;
  tokenAddress: string;
  amount: bigint;
}): Promise<{ calls: ShieldCall[] }> {
  const sdk = assertReady();
  const sharedModels = await import('@railgun-community/shared-models');
  const ethers = await import('ethers');

  const networkName = networkNameForChain(sharedModels, params.chainId);
  if (!networkName) throw new Error(`Railgun: unsupported chain ${params.chainId}`);

  // Deterministic shield key from the TEE signer (note encryption only).
  const teePk = process.env.PRIVATE_KEY as string;
  const shieldMsg = sdk.getShieldPrivateKeySignatureMessage();
  const shieldPrivateKey = ethers.keccak256(await new ethers.Wallet(teePk).signMessage(shieldMsg));

  const erc20AmountRecipients = [
    { tokenAddress: params.tokenAddress, amount: params.amount, recipientAddress: railgunAddress! },
  ];

  const proxy = sharedModels.NETWORK_CONFIG[networkName].proxyContract as `0x${string}`;

  // approve(proxy, amount) — executed by the SA (the token holder)
  const approveIface = new ethers.Interface(['function approve(address spender, uint256 amount)']);
  const approveData = approveIface.encodeFunctionData('approve', [proxy, params.amount]) as `0x${string}`;

  // shield calldata (gasDetails is a stub — the outer UserOp handles gas)
  const gasStub = {
    evmGasType: sharedModels.EVMGasType.Type2,
    gasEstimate: 0n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
  };
  const { transaction } = await sdk.populateShield(
    sharedModels.TXIDVersion.V2_PoseidonMerkle,
    networkName,
    shieldPrivateKey,
    erc20AmountRecipients,
    [],
    gasStub as never
  );

  return {
    calls: [
      { to: params.tokenAddress as `0x${string}`, data: approveData },
      { to: transaction.to as `0x${string}`, data: transaction.data as `0x${string}`, value: transaction.value ? BigInt(transaction.value.toString()) : 0n },
    ],
  };
}

/**
 * Unshield ERC-20 from our shielded balance to a public recipient (the Relay
 * leg-2 deposit address). Generates a proof (~20-30s).
 */
export async function unshieldERC20(params: {
  chainId: number;
  tokenAddress: string;
  amount: bigint;
  toAddress: string;
  gasPrivateKey: string; // public wallet that pays gas + submits the tx
}): Promise<{ txHash: string }> {
  const sdk = assertReady();
  const sharedModels = await import('@railgun-community/shared-models');
  const ethers = await import('ethers');

  const networkName = networkNameForChain(sharedModels, params.chainId);
  if (!networkName) throw new Error(`Railgun: unsupported chain ${params.chainId}`);
  const providerConfig = providerConfigForChain(params.chainId);
  if (!providerConfig) throw new Error(`Railgun: no RPC for chain ${params.chainId}`);
  const provider = new ethers.JsonRpcProvider(providerConfig.providers[0].provider);
  const wallet = new ethers.Wallet(params.gasPrivateKey, provider);

  const encryptionKey = process.env.RAILGUN_ENCRYPTION_KEY || '';
  const erc20AmountRecipients = [
    { tokenAddress: params.tokenAddress, amount: params.amount, recipientAddress: params.toAddress },
  ];
  const sendWithPublicWallet = true;
  const txidVersion = sharedModels.TXIDVersion.V2_PoseidonMerkle;

  const { gasEstimate } = await sdk.gasEstimateForUnprovenUnshield(
    txidVersion,
    networkName,
    railgunWalletId!,
    encryptionKey,
    erc20AmountRecipients,
    [],
    { evmGasType: sharedModels.EVMGasType.Type2, gasEstimate: 0n, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n } as never,
    undefined,
    sendWithPublicWallet
  );

  const overallBatchMinGasPrice = 0n;
  await sdk.generateUnshieldProof(
    txidVersion,
    networkName,
    railgunWalletId!,
    encryptionKey,
    erc20AmountRecipients,
    [],
    undefined,
    sendWithPublicWallet,
    overallBatchMinGasPrice,
    (progress: number) => logger.debug(`Unshield proof progress: ${progress}`, 'Railgun')
  );

  const feeData = await provider.getFeeData();
  const gasDetails = {
    evmGasType: sharedModels.EVMGasType.Type2,
    gasEstimate,
    maxFeePerGas: feeData.maxFeePerGas ?? 0n,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 0n,
  };
  const { transaction } = await sdk.populateProvedUnshield(
    txidVersion,
    networkName,
    railgunWalletId!,
    erc20AmountRecipients,
    [],
    undefined,
    sendWithPublicWallet,
    overallBatchMinGasPrice,
    gasDetails as never
  );

  const tx = await wallet.sendTransaction(transaction);
  await tx.wait();
  logger.info(`Railgun unshield sent: ${tx.hash}`, 'Railgun');
  return { txHash: tx.hash };
}
