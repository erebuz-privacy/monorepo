// Account-Abstraction execution service (ERC-4337 EntryPoint v0.7) for the
// TEE-owned Nexus hub account.
//
// The account is a Biconomy Nexus (ERC-7579) smart account owned by the TEE
// (default k1Validator), derived from the SAME generic NexusAccountFactory +
// bootstrap init that computeSmartAccountForENS uses (owner = TEE, NO module) —
// so it matches what's actually deployed on the hub chain (Arbitrum mainnet).
//
// Arbitrary + BATCHED calls execute as a UserOperation the TEE SELF-BUNDLES:
// it builds + signs the UserOp and submits it via EntryPoint.handleOps (no
// third-party bundler). Gas is pluggable/degradable via a paymaster hook.
//
// VALIDATION STATUS: address derivation is verified against mainnet (a read).
// The UserOp execution path (factory init, ERC-7579 batch encoding, k1Validator
// signature/nonce, self-bundled handleOps, paymaster) is built to spec but must
// be validated on a fork/testnet with a funded account + paymaster before a real
// run — it cannot be exercised locally.

import { privateKeyToAccount } from 'viem/accounts';
import {
  encodeAbiParameters,
  encodeFunctionData,
  bytesToHex,
  toBytes,
  getAddress,
  keccak256,
  toHex,
  pad,
  parseEventLogs,
  decodeErrorResult,
  type Address,
  type Hex,
} from 'viem';
import {
  entryPoint07Abi,
  entryPoint07Address,
  getUserOperationHash,
  toPackedUserOperation,
} from 'viem/account-abstraction';
import { chainManager } from '../../managers/chain';
import { logger } from '../../managers/log';
import { NEXUS_ACCOUNT_FACTORY_ABI } from '../../config/web3/abis';
import { bootstrapInitNexusAbi } from '../../scripts/abis';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface Call {
  to: Address;
  value?: bigint;
  data: Hex;
}

/** Pluggable paymaster hook — returns paymaster fields for a UserOp, or null (account-funded). */
export type PaymasterHook = (ctx: { sender: Address; chainId: number }) => Promise<{
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
} | null>;

let paymasterHook: PaymasterHook | null = null;
export function setPaymasterHook(hook: PaymasterHook | null): void {
  paymasterHook = hook;
}

/** Deterministic per-route salt seed (stable => stable hub address). */
function routeSeed(owner: Address, routeId: string): Hex {
  return keccak256(toHex(`hub:${getAddress(owner)}:${routeId}`));
}

function teeOwner() {
  const pk = process.env.PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error('PRIVATE_KEY not set');
  return privateKeyToAccount(pk);
}

/** True when AA execution can run on a chain (TEE key + factory/bootstrap config + client). */
export function isAaReady(chainId: number): boolean {
  if (!process.env.PRIVATE_KEY) return false;
  const chain = chainManager.getChain(chainId);
  if (!chain) return false;
  // Check the (cheap) Nexus config first; only then build a client, which throws
  // for chains not in viem/chains — treat that as "not ready" rather than crashing.
  if (!chain.getNexusAccountFactory() || !chain.getNexusBootstrap()) return false;
  try {
    return Boolean(chain.getPublicClient());
  } catch {
    return false;
  }
}

/**
 * Build the Nexus bootstrap initData for an owner-only account (default
 * k1Validator = owner, no executors/hooks/fallbacks) and its CREATE2 salt.
 */
function buildInit(chainId: number, routeId: string): { initData: Hex; salt: Hex; owner: Address } {
  const chain = chainManager.getChain(chainId);
  const bootstrap = chain?.getNexusBootstrap();
  if (!bootstrap) throw new Error(`Chain ${chainId} missing NexusBootstrap`);

  const owner = teeOwner().address;
  const salt = routeSeed(owner, routeId);
  const defaultValidatorInitData = bytesToHex(toBytes(getAddress(owner)));

  // The bootstrap installs the k1Validator as the account's DEFAULT validator
  // (owner as init data). It lives in a special slot, NOT the installed-validators
  // list, so the UserOp nonce key must reference the default-validator sentinel
  // (see executeBatch), not the k1Validator address. Do NOT also install it in
  // `validators` — that duplicates it and reverts NexusInitializationFailed.
  const initNexusData = encodeFunctionData({
    abi: bootstrapInitNexusAbi,
    functionName: 'initNexusWithDefaultValidatorAndOtherModulesNoRegistry',
    args: [
      defaultValidatorInitData,
      [], // validators (default validator is set above)
      [], // executors  (no module — owner executes via UserOps)
      { module: ZERO_ADDRESS as Address, data: '0x' as Hex }, // hook
      [], // fallbacks
      [], // preValidationHooks
    ],
  });

  const initData = encodeAbiParameters(
    [{ type: 'address' }, { type: 'bytes' }],
    [bootstrap.address as Address, initNexusData]
  );
  return { initData, salt, owner };
}

// The counterfactual account address is a pure function of (chainId, routeId) via
// buildInit's deterministic initData+salt, so it never changes for a route. Cache
// it to avoid re-calling the factory's computeAccountAddress on every monitor tick
// (a wasteful RPC round-trip that gets throttled on tight public RPCs like Arc's).
const hubAddressCache = new Map<string, Address>();

/** Compute the TEE-owned hub account address for a route (counterfactual, no deploy). */
export async function deriveHubAddress(chainId: number, routeId: string): Promise<Address> {
  const cacheKey = `${chainId}:${routeId}`;
  const cached = hubAddressCache.get(cacheKey);
  if (cached) return cached;
  // EOA-hub fallback: on chains without the Nexus AA stack (e.g. the Sepolia test
  // hub), the hub account IS the TEE's EOA — funds bridge to it, and the shield
  // step executes directly from the EOA (see state-machine RECEIVED_ON_HUB). This
  // is the same EOA path proven by scripts/test-sepolia.ts. Note: a single EOA is
  // shared across routes (no per-route isolation), so this is for test / low-volume
  // use; production hubs (Arbitrum) use per-route AA accounts below.
  if (!isAaReady(chainId)) {
    return teeOwner().address;
  }
  const chain = chainManager.getChain(chainId);
  const publicClient = chain?.getPublicClient();
  const factory = chain?.getNexusAccountFactory();
  if (!publicClient || !factory) throw new Error(`Chain ${chainId} missing publicClient/factory`);
  const { initData, salt } = buildInit(chainId, routeId);
  const address = (await publicClient.readContract({
    address: factory.address as Address,
    abi: NEXUS_ACCOUNT_FACTORY_ABI,
    functionName: 'computeAccountAddress',
    args: [initData, salt],
  })) as Address;
  const derived = getAddress(address);
  hubAddressCache.set(cacheKey, derived);
  return derived;
}

// ERC-7579 execution mode (bytes32, MSB-first):
//   [1b callType][1b execType][4b unused][4b modeSelector][22b modePayload]
// Batch + default (revert-on-fail) => callType 0x01 in the FIRST byte, rest 0.
// NOTE: must be RIGHT-padded — left-padding puts callType in the last byte (0x00
// = CALLTYPE_SINGLE), which makes Nexus decode batch calldata as a single call.
const MODE_BATCH: Hex = pad('0x01', { size: 32, dir: 'right' });

/** Encode a batch of calls as ERC-7579 execute(mode, executionCalldata). */
function encodeExecuteBatch(calls: Call[]): Hex {
  const executions = calls.map((c) => ({ target: c.to, value: c.value ?? 0n, callData: c.data }));
  const executionCalldata = encodeAbiParameters(
    [{ type: 'tuple[]', components: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }] }],
    [executions.map((e) => [e.target, e.value, e.callData] as const)]
  );
  return encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'execute',
        stateMutability: 'payable',
        inputs: [
          { name: 'mode', type: 'bytes32' },
          { name: 'executionCalldata', type: 'bytes' },
        ],
        outputs: [],
      },
    ],
    functionName: 'execute',
    args: [MODE_BATCH, executionCalldata],
  });
}

/**
 * Execute a batch of calls from the hub smart account as a single self-bundled
 * UserOperation (deploying the account on first use). Returns the handleOps tx.
 */
export async function executeBatch(chainId: number, routeId: string, calls: Call[]): Promise<{ txHash: Hex }> {
  if (!isAaReady(chainId)) {
    throw new Error(`AA not ready on chain ${chainId} (need PRIVATE_KEY + Nexus factory/bootstrap config)`);
  }
  const chain = chainManager.getChain(chainId)!;
  const publicClient = chain.getPublicClient();
  const walletClient = chain.getWallet(); // TEE EOA = self-bundler + beneficiary
  const factory = chain.getNexusAccountFactory()!;

  const { initData, salt } = buildInit(chainId, routeId);
  const sender = await deriveHubAddress(chainId, routeId);

  // Deploy args only if not yet deployed.
  const code = await publicClient.getCode({ address: sender });
  const isDeployed = Boolean(code && code !== '0x');
  const factoryData = encodeFunctionData({
    abi: NEXUS_ACCOUNT_FACTORY_ABI,
    functionName: 'createAccount',
    args: [initData, salt],
  });

  // Nexus nonce key layout (NonceLib): [3b empty][1b validation mode][20b validator].
  // Our k1Validator is the account's DEFAULT validator — it lives in a special slot,
  // NOT the installed-validators sentinel list. Nexus addresses the default validator
  // by a ZERO validator field (NonceLib.isDefaultValidatorMode); passing the real
  // k1Validator address instead takes the "is-installed?" branch in _handleValidator
  // and reverts ValidatorNotInstalled (AA23). So the nonce key is 0 (validator=0,
  // validation mode=0 => validate).
  const nonceKey = 0n;
  const nonce = (await publicClient.readContract({
    address: entryPoint07Address,
    abi: entryPoint07Abi,
    functionName: 'getNonce',
    args: [sender, nonceKey],
  })) as bigint;

  const callData = encodeExecuteBatch(calls);
  const fees = await publicClient.estimateFeesPerGas();

  const userOp: Record<string, unknown> = {
    sender,
    nonce,
    ...(isDeployed ? {} : { factory: factory.address as Address, factoryData }),
    callData,
    // Conservative limits — tune via EntryPoint.simulateHandleOp on a fork.
    callGasLimit: 1_000_000n,
    verificationGasLimit: 1_000_000n,
    preVerificationGas: 200_000n,
    maxFeePerGas: fees.maxFeePerGas ?? 1_000_000_000n,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 1_000_000_000n,
  };

  let sponsored = false;
  if (paymasterHook) {
    const pm = await paymasterHook({ sender, chainId });
    if (pm) {
      userOp.paymaster = pm.paymaster;
      userOp.paymasterData = pm.paymasterData;
      userOp.paymasterVerificationGasLimit = pm.paymasterVerificationGasLimit ?? 200_000n;
      userOp.paymasterPostOpGasLimit = pm.paymasterPostOpGasLimit ?? 100_000n;
      sponsored = true;
    }
  }

  // Gas model: "covered". With no paymaster the account itself must prefund the
  // UserOp (EntryPoint.payPrefund pulls from the sender's balance). Since the TEE
  // self-bundles, it funds the account's gas: top the account up to the max the
  // op can cost so validation never reverts AA21 ("didn't pay prefund"). The TEE
  // is refunded the unused portion as handleOps beneficiary, so net cost ≈ gas
  // actually used. A paymaster (when configured) replaces this.
  if (!sponsored) {
    const maxCost =
      ((userOp.callGasLimit as bigint) +
        (userOp.verificationGasLimit as bigint) +
        (userOp.preVerificationGas as bigint) +
        // deploy adds real verification cost beyond the limit's headroom
        (isDeployed ? 0n : 200_000n)) *
      (userOp.maxFeePerGas as bigint);
    const required = (maxCost * 12n) / 10n; // 20% buffer
    const balance = await publicClient.getBalance({ address: sender });
    // On unified-gas chains (Arc: USDC IS native), the account's "native" balance is
    // the USDC we intend to CCTP-burn — it is NOT spare gas money. If we skipped the
    // top-up here, the EntryPoint would prefund gas out of that balance and the batch's
    // depositForBurn(full amount) would then revert "transfer amount exceeds balance".
    // So add gas ON TOP of the deposit unconditionally; the extra keeps the full amount
    // burnable and the relayer is refunded the unused portion as handleOps beneficiary.
    const topUp = chain.unifiedGasToken ? required : balance < required ? required - balance : 0n;
    if (topUp > 0n) {
      logger.info(`AA gas top-up ${topUp} wei -> ${sender} on chain ${chainId}`, 'AA');
      const fundTx = await walletClient.sendTransaction({
        account: walletClient.account!,
        chain: chain.getViemChain(),
        to: sender,
        value: topUp,
      });
      await publicClient.waitForTransactionReceipt({ hash: fundTx });
    }
  }

  // Owner signs the userOpHash (validated on-chain by the k1Validator).
  const userOpHash = getUserOperationHash({
    userOperation: userOp as never,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: '0.7',
    chainId,
  });
  const signature = await teeOwner().signMessage({ message: { raw: userOpHash } });
  const packed = toPackedUserOperation({ ...userOp, signature } as never);

  logger.info(`AA self-bundle handleOps chain ${chainId} sender ${sender} deploy=${!isDeployed}`, 'AA');
  const txHash = await walletClient.writeContract({
    address: entryPoint07Address,
    abi: entryPoint07Abi,
    functionName: 'handleOps',
    args: [[packed], walletClient.account!.address],
    account: walletClient.account!,
    chain: chain.getViemChain(),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // handleOps succeeds at the tx level even when the inner UserOp REVERTS — the
  // EntryPoint catches it and emits UserOperationEvent{success:false} plus a
  // UserOperationRevertReason. Treating that as success would advance the route
  // with a phantom (e.g. a CCTP burn that never actually burned). So assert the op
  // succeeded, surfacing the decoded revert reason when it didn't.
  const events = parseEventLogs({ abi: entryPoint07Abi, logs: receipt.logs });
  const opEvent = events.find(
    (e) => e.eventName === 'UserOperationEvent' && (e.args as { userOpHash?: Hex }).userOpHash === userOpHash
  );
  if (opEvent && (opEvent.args as { success?: boolean }).success === false) {
    const revert = events.find(
      (e) => e.eventName === 'UserOperationRevertReason' && (e.args as { userOpHash?: Hex }).userOpHash === userOpHash
    );
    const reasonBytes = revert ? (revert.args as { revertReason?: Hex }).revertReason : undefined;
    let reason = reasonBytes ?? '(no reason)';
    try {
      if (reasonBytes && reasonBytes !== '0x') {
        const decoded = decodeErrorResult({ data: reasonBytes });
        reason = `${decoded.errorName}(${(decoded.args ?? []).join(', ')})`;
      }
    } catch {
      /* keep raw bytes */
    }
    throw new Error(`UserOp reverted on chain ${chainId} (tx ${txHash}): ${reason}`);
  }
  logger.info(`AA handleOps confirmed: ${txHash}`, 'AA');
  return { txHash };
}
