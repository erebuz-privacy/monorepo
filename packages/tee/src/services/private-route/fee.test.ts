import assert from 'node:assert/strict';
import test from 'node:test';
import { computeArcCctpRouteFees, computeCctpRouteFees } from './fee';

void test('keeps Railgun and Arc CCTP route economics separate', () => {
  const amount = 5_000_000n;
  const railgun = computeCctpRouteFees(amount, 5);
  const arc = computeArcCctpRouteFees(amount, 5);

  assert.equal(railgun.serviceFee, 1_000_000n);
  assert.equal(arc.serviceFee, 1_000_000n);
  assert.equal(arc.poolDepositFee, 50_000n);
  assert.equal(arc.withdrawalAmount, 4_000_000n);
  assert.equal(arc.bridgeFee, 1_200n);
  assert.equal(arc.quotedOutput, 3_998_800n);
  assert.ok(arc.quotedOutput > railgun.quotedOutput);
});
