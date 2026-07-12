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
  return Boolean(chain.getPublicClient() && chain.getNexusAccountFactory() && chain.getNexusBootstrap());
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

  const initNexusData = encodeFunctionData({
    abi: bootstrapInitNexusAbi,
    functionName: 'initNexusWithDefaultValidatorAndOtherModulesNoRegistry',
    args: [
      defaultValidatorInitData,
      [], // validators
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

/** Compute the TEE-owned hub account address for a route (counterfactual, no deploy). */
export async function deriveHubAddress(chainId: number, routeId: string): Promise<Address> {
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
  return getAddress(address);
}

// ERC-7579 execution mode for a default batch call (CallType 0x01, ExecType 0x00).
const MODE_BATCH: Hex = pad('0x01', { size: 32 });

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
  const validator = chain.getContractByName('k1Validator');

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

  // Nexus selects the validator via the top 20 bytes of the nonce key.
  const validatorKey = validator ? pad(validator.address as Hex, { size: 24 }) : pad('0x', { size: 24 });
  const nonce = (await publicClient.readContract({
    address: entryPoint07Address,
    abi: entryPoint07Abi,
    functionName: 'getNonce',
    args: [sender, BigInt(validatorKey)],
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

  if (paymasterHook) {
    const pm = await paymasterHook({ sender, chainId });
    if (pm) {
      userOp.paymaster = pm.paymaster;
      userOp.paymasterData = pm.paymasterData;
      userOp.paymasterVerificationGasLimit = pm.paymasterVerificationGasLimit ?? 200_000n;
      userOp.paymasterPostOpGasLimit = pm.paymasterPostOpGasLimit ?? 100_000n;
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
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  logger.info(`AA handleOps confirmed: ${txHash}`, 'AA');
  return { txHash };
}
