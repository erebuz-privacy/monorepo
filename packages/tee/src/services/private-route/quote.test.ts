import assert from 'node:assert/strict';
import test from 'node:test';
import { quotePrivateRoute } from './quote';

void test('quotes the Arc pool as a separate testnet CCTP route', async () => {
  const quote = await quotePrivateRoute({
    sourceChainId: 84532,
    destChainId: 5042002,
    amount: '5',
    privacyProvider: 'arc',
  });

  assert.equal(quote.privacyProvider, 'arc');
  assert.equal(quote.hubChainId, 5042002);
  assert.deepEqual(quote.route, [
    'Base Sepolia',
    'Circle CCTP',
    'Erebuz Privacy Pool (Arc)',
    'Arc Testnet',
  ]);
  // Destination IS the hub (Arc), so there is no outbound CCTP leg and no bridge
  // fee: the state machine transfers straight from the hub account. Previously
  // this asserted 3998800, from a hardcoded 3 bps charged for a hop that never ran.
  assert.equal(quote.bridgeFeeAmount, '0');
  assert.equal(quote.quotedOutputAmount, '4000000');

  await assert.rejects(
    quotePrivateRoute({
      sourceChainId: 1,
      destChainId: 5042002,
      amount: '5',
      privacyProvider: 'arc',
    }),
    /Unsupported CCTP route/
  );
});
