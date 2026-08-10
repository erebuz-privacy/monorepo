import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { generateMerkleProof, getCommitment } from '@0xbow/privacy-pools-core-sdk';
import { createPublicClient, http, parseAbi } from 'viem';
import type { PrivateRoute } from '../../database/models/private-route';
import {
  ARC_PRIVACY_ENTRYPOINT,
  ARC_PRIVACY_POOL,
  ARC_PRIVACY_SCOPE,
  ARC_PRIVACY_USDC,
  createArcPrivacyPayload,
  formatArcWithdrawalProof,
  prepareArcPoolWithdrawal,
} from '.';

const artifactsDirectory = process.env.ARC_PRIVACY_INTEGRATION_ARTIFACTS_DIR;

void test(
  'generates and verifies a real Groth16 withdrawal proof from an ASP snapshot',
  { skip: !artifactsDirectory },
  async () => {
    const previousEncryptionKey = process.env.ROUTE_ENCRYPTION_KEY;
    const previousAspUrl = process.env.ARC_PRIVACY_ASP_URL;
    const previousArtifactsDirectory = process.env.ARC_PRIVACY_ARTIFACTS_DIR;
    process.env.ROUTE_ENCRYPTION_KEY = 'proof-integration-test-key';
    process.env.ARC_PRIVACY_ARTIFACTS_DIR = artifactsDirectory;

    const payload = createArcPrivacyPayload();
    const value = 4_950_000n;
    const label = 123_456_789n;
    const commitment = getCommitment(
      value,
      label,
      BigInt(payload.nullifier) as never,
      BigInt(payload.secret) as never
    ).hash;
    payload.deposit = {
      transactionHash: `0x${'11'.repeat(32)}`,
      value: value.toString(),
      label: label.toString(),
      commitment: commitment.toString(),
    };

    const stateLeaves = [commitment, 987_654_321n];
    const aspLeaves = [label, 234_567_891n];
    const stateRoot = generateMerkleProof(stateLeaves, commitment).root;
    const aspRoot = generateMerkleProof(aspLeaves, label).root;
    const snapshot = {
      stateTree: { root: stateRoot.toString(), depth: 1, size: stateLeaves.length, leaves: stateLeaves.map(String) },
      associationSet: { root: aspRoot.toString(), depth: 1, aspLeaves: aspLeaves.map(String) },
      protocol: {
        pool: ARC_PRIVACY_POOL,
        entrypoint: ARC_PRIVACY_ENTRYPOINT,
        scope: ARC_PRIVACY_SCOPE.toString(),
      },
      onchain: { activated: true },
      publishable: true,
    };

    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify(
          request.url === '/health'
            ? { status: 'ready', stateRoot: stateRoot.toString(), aspRoot: aspRoot.toString() }
            : snapshot
        )
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unable to start the test ASP server');
    process.env.ARC_PRIVACY_ASP_URL = `http://127.0.0.1:${address.port}`;

    const route = {
      id: 'route_proof_test',
      hubAccount: '0x0000000000000000000000000000000000001234',
      amount: '5000000',
      feeAmount: '1000000',
      tokenAddress: ARC_PRIVACY_USDC,
    } as PrivateRoute;

    try {
      const prepared = await prepareArcPoolWithdrawal(route, payload);
      assert.ok(prepared?.withdrawal);
      assert.equal(prepared.withdrawal.amount, '4000000');
      assert.equal(prepared.withdrawal.stateRoot, stateRoot.toString());
      assert.equal(prepared.withdrawal.aspRoot, aspRoot.toString());
      assert.equal(prepared.withdrawal.publicSignals.length, 8);

      const rpc = process.env.ARC_PRIVACY_INTEGRATION_RPC;
      if (rpc) {
        const client = createPublicClient({ transport: http(rpc) });
        const verifier = await client.readContract({
          address: ARC_PRIVACY_POOL,
          abi: parseAbi(['function WITHDRAWAL_VERIFIER() view returns (address)']),
          functionName: 'WITHDRAWAL_VERIFIER',
        });
        const formatted = formatArcWithdrawalProof(
          prepared.withdrawal.proof,
          prepared.withdrawal.publicSignals
        );
        const valid = await client.readContract({
          address: verifier,
          abi: parseAbi([
            'function verifyProof(uint256[2], uint256[2][2], uint256[2], uint256[8]) view returns (bool)',
          ]),
          functionName: 'verifyProof',
          args: [formatted.pA, formatted.pB, formatted.pC, formatted.pubSignals],
        });
        assert.equal(valid, true);
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      if (previousEncryptionKey === undefined) delete process.env.ROUTE_ENCRYPTION_KEY;
      else process.env.ROUTE_ENCRYPTION_KEY = previousEncryptionKey;
      if (previousAspUrl === undefined) delete process.env.ARC_PRIVACY_ASP_URL;
      else process.env.ARC_PRIVACY_ASP_URL = previousAspUrl;
      if (previousArtifactsDirectory === undefined) delete process.env.ARC_PRIVACY_ARTIFACTS_DIR;
      else process.env.ARC_PRIVACY_ARTIFACTS_DIR = previousArtifactsDirectory;
    }
  }
);
