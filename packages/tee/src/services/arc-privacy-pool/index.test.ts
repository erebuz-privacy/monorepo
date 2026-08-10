import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildArcPoolDepositCalls,
  createArcPrivacyPayload,
  parseArcPrivacyPayload,
  serializeArcPrivacyPayload,
} from '.';

void test('creates an encrypted-store-compatible Arc note and deposit batch', () => {
  const previous = process.env.ROUTE_ENCRYPTION_KEY;
  process.env.ROUTE_ENCRYPTION_KEY = 'test-only-route-encryption-key';
  try {
    const payload = createArcPrivacyPayload();
    const restored = parseArcPrivacyPayload(serializeArcPrivacyPayload(payload));
    assert.equal(restored.version, 1);
    assert.match(restored.precommitment, /^\d+$/);
    assert.notEqual(restored.nullifier, restored.secret);

    const calls = buildArcPoolDepositCalls(5_000_000n, restored);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].data.slice(0, 10), '0x095ea7b3'); // approve
    assert.equal(calls[1].data.length > 10, true);
  } finally {
    if (previous === undefined) delete process.env.ROUTE_ENCRYPTION_KEY;
    else process.env.ROUTE_ENCRYPTION_KEY = previous;
  }
});
