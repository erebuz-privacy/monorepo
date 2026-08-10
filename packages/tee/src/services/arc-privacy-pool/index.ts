// Erebuz Privacy Pool adapter for Arc Testnet.
//
// This is a second privacy provider beside Railgun. Cross-chain legs continue
// to use Circle CCTP; only the privacy hop changes:
// source -> CCTP -> Arc hub account -> PrivacyPoolComplex -> hub account -> CCTP -> destination.

import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bigintToHash,
  calculateContext,
  generateMerkleProof,
  getCommitment,
  hashPrecommitment,
} from '@0xbow/privacy-pools-core-sdk';
import { poseidon } from 'maci-crypto/build/ts/hashing.js';
import {
  encodeFunctionData,
  getAddress,
  parseAbi,
  parseEventLogs,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem';
import { chainManager } from '../../managers/chain';
import { logger } from '../../managers/log';
import { fieldEncryptionEnabled } from '../../security/field-crypto';
import type { PrivateRoute } from '../../database/models/private-route';
import { ARC_PRIVACY_HUB_CHAIN_ID } from '../../config/global-config';
import { executeBatch } from '../aa';

export const ARC_PRIVACY_ENTRYPOINT = '0x7fA6F4E71eacEA2646F9D0f7c9a1539Dd694b1c8' as Address;
export const ARC_PRIVACY_POOL = '0x7F8A2BB0cCb5402cd9986e1fcA010D5df9A539Cc' as Address;
export const ARC_PRIVACY_USDC = '0x3600000000000000000000000000000000000000' as Address;
export const ARC_PRIVACY_SCOPE =
  14508043559420656070848409224091111501903008011015566451849387710630601499094n;
export const ARC_PRIVACY_DEPLOYMENT_BLOCK = 56_008_220n;
export const ARC_PRIVACY_VETTING_FEE_BPS = 100n;

const SNARK_SCALAR_FIELD =
  21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617n;

const ENTRYPOINT_ABI = parseAbi([
  'function deposit(address asset, uint256 value, uint256 precommitment) returns (uint256 commitment)',
  'function latestRoot() view returns (uint256)',
  'function usedPrecommitments(uint256 precommitment) view returns (bool)',
]);
const POOL_ABI = parseAbi([
  'function currentRoot() view returns (uint256)',
  'function currentTreeDepth() view returns (uint256)',
  'function currentTreeSize() view returns (uint256)',
  'function dead() view returns (bool)',
  'function nullifierHashes(uint256 nullifierHash) view returns (bool)',
  'function withdraw((address processooor, bytes data) withdrawal, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[8] pubSignals) proof)',
  'event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)',
  'event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)',
]);
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

type SerializedProof = {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol?: string;
  curve?: string;
};

export type ArcPrivacyPayload = {
  version: 1;
  nullifier: string;
  secret: string;
  precommitment: string;
  deposit?: {
    transactionHash: Hex;
    value: string;
    label: string;
    commitment: string;
  };
  withdrawal?: {
    amount: string;
    newNullifier: string;
    newSecret: string;
    newCommitment: string;
    spentNullifier: string;
    stateRoot: string;
    aspRoot: string;
    processooor: Address;
    proof: SerializedProof;
    publicSignals: string[];
  };
};

type AspSnapshot = {
  stateTree: { root: string; depth: number; size: number; leaves: string[] };
  associationSet: { root: string; depth: number; aspLeaves: string[] };
  protocol: { pool: string; entrypoint: string; scope: string };
  onchain?: { activated?: boolean };
  publishable?: boolean;
};

function randomFieldElement(): bigint {
  let value = 0n;
  while (value === 0n) value = BigInt(`0x${randomBytes(32).toString('hex')}`) % SNARK_SCALAR_FIELD;
  return value;
}

export function createArcPrivacyPayload(): ArcPrivacyPayload {
  if (!fieldEncryptionEnabled()) {
    throw new Error('Arc privacy routes require ROUTE_ENCRYPTION_KEY to protect pool note secrets');
  }
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  return {
    version: 1,
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    precommitment: BigInt(hashPrecommitment(nullifier as never, secret as never)).toString(),
  };
}

export function parseArcPrivacyPayload(value: string | null): ArcPrivacyPayload {
  if (!value) throw new Error('Arc privacy route is missing its encrypted note payload');
  const payload = JSON.parse(value) as ArcPrivacyPayload;
  if (
    payload.version !== 1 ||
    !/^\d+$/.test(payload.nullifier) ||
    !/^\d+$/.test(payload.secret) ||
    !/^\d+$/.test(payload.precommitment)
  ) {
    throw new Error('Arc privacy route contains an invalid note payload');
  }
  return payload;
}

export function serializeArcPrivacyPayload(payload: ArcPrivacyPayload): string {
  return JSON.stringify(payload);
}

export function buildArcPoolDepositCalls(amount: bigint, payload: ArcPrivacyPayload) {
  return [
    {
      to: ARC_PRIVACY_USDC,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ARC_PRIVACY_ENTRYPOINT, amount],
      }),
    },
    {
      to: ARC_PRIVACY_ENTRYPOINT,
      data: encodeFunctionData({
        abi: ENTRYPOINT_ABI,
        functionName: 'deposit',
        args: [ARC_PRIVACY_USDC, amount, BigInt(payload.precommitment)],
      }),
    },
  ];
}

function confirmDepositReceipt(
  receipt: TransactionReceipt,
  hubAccount: Address,
  payload: ArcPrivacyPayload
): ArcPrivacyPayload {
  const logs = parseEventLogs({ abi: POOL_ABI, eventName: 'Deposited', logs: receipt.logs, strict: true }).filter(
    (log) => getAddress(log.address) === ARC_PRIVACY_POOL
  );
  if (logs.length !== 1) throw new Error(`Expected one Arc pool deposit event, found ${logs.length}`);
  const event = logs[0].args;
  if (getAddress(event._depositor) !== getAddress(hubAccount)) {
    throw new Error('Arc pool deposit event has an unexpected depositor');
  }
  if (event._precommitmentHash !== BigInt(payload.precommitment)) {
    throw new Error('Arc pool deposit event has an unexpected precommitment');
  }
  const expected = getCommitment(
    event._value,
    event._label,
    BigInt(payload.nullifier) as never,
    BigInt(payload.secret) as never
  ).hash;
  if (event._commitment !== expected) throw new Error('Arc pool commitment does not match the encrypted note');
  return {
    ...payload,
    deposit: {
      transactionHash: receipt.transactionHash,
      value: event._value.toString(),
      label: event._label.toString(),
      commitment: event._commitment.toString(),
    },
  };
}

export async function depositIntoArcPrivacyPool(
  route: PrivateRoute,
  payload: ArcPrivacyPayload,
  amount: bigint
): Promise<ArcPrivacyPayload> {
  if (!route.hubAccount) throw new Error('Arc privacy route has no hub account');
  const chain = chainManager.getChain(ARC_PRIVACY_HUB_CHAIN_ID);
  if (!chain) throw new Error('Arc Testnet is not configured');
  const publicClient = chain.getPublicClient();

  // Recovery path when the process stopped after the UserOp landed but before
  // the encrypted payload was updated.
  const used = await publicClient.readContract({
    address: ARC_PRIVACY_ENTRYPOINT,
    abi: ENTRYPOINT_ABI,
    functionName: 'usedPrecommitments',
    args: [BigInt(payload.precommitment)],
  });
  if (used) {
    const event = POOL_ABI.find((item) => item.type === 'event' && item.name === 'Deposited')!;
    const latest = await publicClient.getBlockNumber();
    for (let to = latest; to >= ARC_PRIVACY_DEPLOYMENT_BLOCK; ) {
      const from = to > 9_999n ? to - 9_999n : 0n;
      const logs = await publicClient.getLogs({ address: ARC_PRIVACY_POOL, event, fromBlock: from, toBlock: to });
      const match = logs.find((log) => log.args._precommitmentHash === BigInt(payload.precommitment));
      if (match?.transactionHash) {
        return confirmDepositReceipt(
          await publicClient.getTransactionReceipt({ hash: match.transactionHash }),
          getAddress(route.hubAccount),
          payload
        );
      }
      if (from <= ARC_PRIVACY_DEPLOYMENT_BLOCK) break;
      to = from - 1n;
    }
    throw new Error('Arc precommitment is used but its deposit receipt could not be recovered');
  }

  const { txHash } = await executeBatch(
    ARC_PRIVACY_HUB_CHAIN_ID,
    route.id,
    buildArcPoolDepositCalls(amount, payload)
  );
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  return confirmDepositReceipt(receipt, getAddress(route.hubAccount), payload);
}

async function fetchJson<T>(url: string, scopeHeader = false): Promise<T> {
  const response = await fetch(url, {
    headers: scopeHeader ? { 'X-Pool-Scope': ARC_PRIVACY_SCOPE.toString() } : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Arc ASP returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function loadApprovedSnapshot(payload: ArcPrivacyPayload): Promise<AspSnapshot | null> {
  const baseUrl = process.env.ARC_PRIVACY_ASP_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) throw new Error('ARC_PRIVACY_ASP_URL is required for Arc privacy routes');
  const [health, snapshot] = await Promise.all([
    fetchJson<{ status?: string; aspRoot?: string; stateRoot?: string }>(`${baseUrl}/health`),
    fetchJson<AspSnapshot>(`${baseUrl}/v1/association-set/latest`, true),
  ]);
  if (
    health.status !== 'ready' ||
    getAddress(snapshot.protocol.pool) !== ARC_PRIVACY_POOL ||
    getAddress(snapshot.protocol.entrypoint) !== ARC_PRIVACY_ENTRYPOINT ||
    snapshot.protocol.scope !== ARC_PRIVACY_SCOPE.toString() ||
    snapshot.onchain?.activated !== true ||
    snapshot.publishable !== true
  ) {
    throw new Error('Arc ASP is not serving an activated snapshot for the Erebuz pool');
  }
  if (!payload.deposit) return null;
  if (!snapshot.stateTree.leaves.includes(payload.deposit.commitment)) return null;
  if (!snapshot.associationSet.aspLeaves.includes(payload.deposit.label)) return null;
  if (health.stateRoot !== snapshot.stateTree.root || health.aspRoot !== snapshot.associationSet.root) {
    throw new Error('Arc ASP health roots do not match its snapshot');
  }
  return snapshot;
}

const ARTIFACT_COMMIT = '11984315cb8f84544b2188b9c1699839aa5d9471';
const ARTIFACTS = {
  wasm: {
    file: 'withdraw.wasm',
    remote: 'packages/circuits/build/withdraw/withdraw_js/withdraw.wasm',
    sha256: '36cda22791def3d520a55c0fc808369cd5849532a75fab65686e666ed3d55c10',
  },
  zkey: {
    file: 'withdraw.zkey',
    remote: 'packages/circuits/trusted-setup/final-keys/withdraw.zkey',
    sha256: '2a893b42174c813566e5c40c715a8b90cd49fc4ecf384e3a6024158c3d6de677',
  },
  vkey: {
    file: 'withdraw.vkey',
    remote: 'packages/circuits/trusted-setup/final-keys/withdraw.vkey',
    sha256: '666bd0983b20c1611543b04f7712e067fbe8cad69f07ada8a310837ff398d21e',
  },
} as const;

class ArcWithdrawalArtifacts {
  private cache = new Map<keyof typeof ARTIFACTS, Promise<string>>();

  private async resolve(kind: keyof typeof ARTIFACTS): Promise<string> {
    const spec = ARTIFACTS[kind];
    const directory = process.env.ARC_PRIVACY_ARTIFACTS_DIR?.trim();
    let path: string;
    if (directory) {
      path = join(directory, spec.file);
    } else {
      const cacheDirectory =
        process.env.ARC_PRIVACY_ARTIFACT_CACHE_DIR?.trim() ||
        join(process.cwd(), 'data', 'arc-privacy-artifacts', ARTIFACT_COMMIT);
      await mkdir(cacheDirectory, { recursive: true });
      path = join(cacheDirectory, spec.file);
      try {
        const cached = await readFile(path);
        if (createHash('sha256').update(cached).digest('hex') === spec.sha256) return path;
      } catch {
        // Missing or invalid cache entry: fetch the pinned artifact below.
      }
      const root = (process.env.ARC_PRIVACY_ARTIFACTS_URL ||
        `https://raw.githubusercontent.com/Abhi270303/privacy-pool-arc/${ARTIFACT_COMMIT}/`).replace(/\/$/, '');
      const response = await fetch(`${root}/${spec.remote}`, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`Unable to fetch Arc ${spec.file}: HTTP ${response.status}`);
      const downloaded = new Uint8Array(await response.arrayBuffer());
      const digest = createHash('sha256').update(downloaded).digest('hex');
      if (digest !== spec.sha256) throw new Error(`Arc ${spec.file} failed its pinned SHA-256 check`);
      const temporaryPath = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      await writeFile(temporaryPath, downloaded);
      await rename(temporaryPath, path);
      return path;
    }
    const bytes = await readFile(path);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== spec.sha256) throw new Error(`Arc ${spec.file} failed its pinned SHA-256 check`);
    return path;
  }

  path(kind: keyof typeof ARTIFACTS): Promise<string> {
    let pending = this.cache.get(kind);
    if (!pending) {
      pending = this.resolve(kind);
      this.cache.set(kind, pending);
    }
    return pending;
  }
}

const artifacts = new ArcWithdrawalArtifacts();

async function proveAndVerifyWithdrawal(inputSignals: Record<string, string | string[]>): Promise<{
  proof: SerializedProof;
  publicSignals: string[];
}> {
  const [wasm, zkey, vkey] = await Promise.all([
    artifacts.path('wasm'),
    artifacts.path('zkey'),
    artifacts.path('vkey'),
  ]);
  const worker = fileURLToPath(new URL('./prove-worker.mjs', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, wasm, zkey, vkey], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 16_384) stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Arc proof worker failed (${code ?? 'signal'}): ${stderr.trim() || 'unknown error'}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as { proof: SerializedProof; publicSignals: string[] });
      } catch {
        reject(new Error('Arc proof worker returned invalid JSON'));
      }
    });
    child.stdin.end(JSON.stringify(inputSignals));
  });
}

export function formatArcWithdrawalProof(proof: SerializedProof, publicSignals: string[]) {
  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as [bigint, bigint],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ] as [[bigint, bigint], [bigint, bigint]],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as [bigint, bigint],
    pubSignals: publicSignals.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
  };
}

export async function prepareArcPoolWithdrawal(
  route: PrivateRoute,
  payload: ArcPrivacyPayload
): Promise<ArcPrivacyPayload | null> {
  if (!payload.deposit || !route.hubAccount) throw new Error('Arc pool deposit is not confirmed');
  const snapshot = await loadApprovedSnapshot(payload);
  if (!snapshot) return null; // deposited, but ASP has not approved/published this note yet

  const amount = BigInt(route.amount) - BigInt(route.feeAmount);
  const value = BigInt(payload.deposit.value);
  if (amount <= 0n || amount >= value) {
    throw new Error(`Arc pool route is insolvent: requested withdrawal ${amount}, deposited value ${value}`);
  }

  const stateLeaves = snapshot.stateTree.leaves.map(BigInt);
  const aspLeaves = snapshot.associationSet.aspLeaves.map(BigInt);
  const stateMerkleProof = generateMerkleProof(stateLeaves, BigInt(payload.deposit.commitment));
  const aspMerkleProof = generateMerkleProof(aspLeaves, BigInt(payload.deposit.label));
  const newNullifier = randomFieldElement();
  const newSecret = randomFieldElement();
  const newCommitment = getCommitment(
    value - amount,
    BigInt(payload.deposit.label),
    newNullifier as never,
    newSecret as never
  ).hash;
  const processooor = getAddress(route.hubAccount);
  const withdrawal = { processooor, data: '0x' as Hex };
  const context = BigInt(calculateContext(withdrawal, bigintToHash(ARC_PRIVACY_SCOPE)));
  const spentNullifier = BigInt(poseidon([BigInt(payload.nullifier)]));

  const generated = await proveAndVerifyWithdrawal({
    withdrawnValue: amount.toString(),
    stateRoot: String(bigintToHash(BigInt(snapshot.stateTree.root))),
    stateTreeDepth: String(snapshot.stateTree.depth),
    ASPRoot: String(bigintToHash(BigInt(snapshot.associationSet.root))),
    ASPTreeDepth: String(snapshot.associationSet.depth),
    context: context.toString(),
    label: payload.deposit.label,
    existingValue: payload.deposit.value,
    existingNullifier: payload.nullifier,
    existingSecret: payload.secret,
    newNullifier: newNullifier.toString(),
    newSecret: newSecret.toString(),
    stateSiblings: stateMerkleProof.siblings.map(String),
    stateIndex: String(stateMerkleProof.index),
    ASPSiblings: aspMerkleProof.siblings.map(String),
    ASPIndex: String(aspMerkleProof.index),
  });

  const expectedSignals = [
    newCommitment,
    spentNullifier,
    amount,
    BigInt(snapshot.stateTree.root),
    BigInt(snapshot.stateTree.depth),
    BigInt(snapshot.associationSet.root),
    BigInt(snapshot.associationSet.depth),
    context,
  ];
  if (
    generated.publicSignals.length !== expectedSignals.length ||
    generated.publicSignals.some((signal, index) => BigInt(signal) !== expectedSignals[index])
  ) {
    throw new Error('Arc withdrawal proof public signals do not match the route');
  }

  return {
    ...payload,
    withdrawal: {
      amount: amount.toString(),
      newNullifier: newNullifier.toString(),
      newSecret: newSecret.toString(),
      newCommitment: newCommitment.toString(),
      spentNullifier: spentNullifier.toString(),
      stateRoot: snapshot.stateTree.root,
      aspRoot: snapshot.associationSet.root,
      processooor,
      proof: {
        protocol: generated.proof.protocol,
        curve: generated.proof.curve,
        pi_a: generated.proof.pi_a.map(String),
        pi_b: generated.proof.pi_b.map((point) => point.map(String)),
        pi_c: generated.proof.pi_c.map(String),
      },
      publicSignals: generated.publicSignals.map(String),
    },
  };
}

export async function submitArcPoolWithdrawal(route: PrivateRoute, payload: ArcPrivacyPayload): Promise<Hex> {
  if (!payload.withdrawal) throw new Error('Arc withdrawal proof is not prepared');
  if (!route.hubAccount || getAddress(route.hubAccount) !== payload.withdrawal.processooor) {
    throw new Error('Arc withdrawal processooor does not match the route hub account');
  }
  const chain = chainManager.getChain(ARC_PRIVACY_HUB_CHAIN_ID);
  if (!chain) throw new Error('Arc Testnet is not configured');
  const publicClient = chain.getPublicClient();
  const spent = await publicClient.readContract({
    address: ARC_PRIVACY_POOL,
    abi: POOL_ABI,
    functionName: 'nullifierHashes',
    args: [BigInt(payload.withdrawal.spentNullifier)],
  });
  if (spent) {
    // Idempotent recovery: the withdrawal may have landed before the route row
    // was advanced. Recover the unique event instead of ever resubmitting it.
    const event = POOL_ABI.find((item) => item.type === 'event' && item.name === 'Withdrawn')!;
    const latest = await publicClient.getBlockNumber();
    for (let to = latest; to >= ARC_PRIVACY_DEPLOYMENT_BLOCK; ) {
      const from = to > 9_999n ? to - 9_999n : 0n;
      const logs = await publicClient.getLogs({ address: ARC_PRIVACY_POOL, event, fromBlock: from, toBlock: to });
      const match = logs.find(
        (log) =>
          log.args._spentNullifier === BigInt(payload.withdrawal!.spentNullifier) &&
          log.args._value === BigInt(payload.withdrawal!.amount) &&
          getAddress(log.args._processooor!) === payload.withdrawal!.processooor
      );
      if (match?.transactionHash) return match.transactionHash;
      if (from <= ARC_PRIVACY_DEPLOYMENT_BLOCK) break;
      to = from - 1n;
    }
    throw new Error('Arc withdrawal nullifier is spent but its receipt could not be recovered');
  }

  // Refuse to broadcast a proof against roots that changed while it was queued.
  const [stateRoot, aspRoot, dead] = await Promise.all([
    publicClient.readContract({ address: ARC_PRIVACY_POOL, abi: POOL_ABI, functionName: 'currentRoot' }),
    publicClient.readContract({ address: ARC_PRIVACY_ENTRYPOINT, abi: ENTRYPOINT_ABI, functionName: 'latestRoot' }),
    publicClient.readContract({ address: ARC_PRIVACY_POOL, abi: POOL_ABI, functionName: 'dead' }),
  ]);
  if (dead) throw new Error('Arc privacy pool is wound down');
  if (stateRoot !== BigInt(payload.withdrawal.stateRoot) || aspRoot !== BigInt(payload.withdrawal.aspRoot)) {
    throw new Error('Arc pool roots changed after proof generation; regenerate the route proof');
  }

  // PrivacyPool.validWithdrawal requires msg.sender to equal `processooor`.
  // The route's processooor is its Nexus smart account, so the TEE EOA cannot
  // call withdraw directly; execute it through the same account that deposited.
  const data = encodeFunctionData({
    abi: POOL_ABI,
    functionName: 'withdraw',
    args: [
      { processooor: payload.withdrawal.processooor, data: '0x' },
      formatArcWithdrawalProof(payload.withdrawal.proof, payload.withdrawal.publicSignals),
    ],
  });
  const { txHash: hash } = await executeBatch(ARC_PRIVACY_HUB_CHAIN_ID, route.id, [
    { to: ARC_PRIVACY_POOL, data },
  ]);
  const receipt = await publicClient.getTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Arc pool withdrawal ${hash} reverted`);
  logger.info(`Arc privacy withdrawal confirmed: ${hash}`, 'ArcPrivacyPool');
  return hash;
}

export function clearArcWithdrawal(payload: ArcPrivacyPayload): ArcPrivacyPayload {
  const depositPayload = { ...payload };
  delete depositPayload.withdrawal;
  return depositPayload;
}
