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
  assert.equal(quote.quotedOutputAmount, '3998800');

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
