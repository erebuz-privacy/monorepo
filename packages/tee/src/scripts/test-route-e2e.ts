#!/usr/bin/env tsx
/**
 * Full private-route end-to-end on testnet (CCTP + Railgun + Nexus AA).
 *
 * Self-contained: creates a fresh route with the CURRENT code (so the per-route
 * smart-account address is derived consistently), funds its source smart account
 * with USDC from the TEE EOA, then drives the state machine to COMPLETED, printing
 * status + on-chain balances at each transition.
 *
 * Recipient defaults to the TEE EOA, so funds return to a real address you control
 * (a closed privacy loop: EOA -> source SA -> CCTP -> hub SA -> Railgun shield ->
 * unshield -> CCTP -> recipient), recovering the test USDC minus fee + bridge cost.
 *
 * Env must be on the CLI (import-time config), e.g.:
 *   BRIDGE_PROVIDER=cctp PRIVACY_HUB_CHAIN_ID=11155111 \
 *   DATABASE_PATH=/path/tee-cctp2.sqlite \
 *   RPC_84532=https://base-sepolia-rpc.publicnode.com \
 *   RAILGUN_RPC_11155111=https://ethereum-sepolia-rpc.publicnode.com \
 *   RAILGUN_POI_NODE_URL=http://localhost:8080 PRIVATE_ROUTE_FEE_MIN_USD=0.1 \
 *     pnpm --filter @erebuz/tee test:e2e -- --amount=1 [--recipient=0x..] [--source=84532] [--dest=84532]
 */
import '../config/load-env'; // loads .env / .env.railgun.local (+ maps TEST_PRIVATE_KEY) as a side effect
import { ethers } from 'ethers';
import { getAddress } from 'viem';
import { chainManager } from '../managers/chain';
import { initRailgunEngine, isRailgunReady, getRailgunAddress } from '../services/railgun';
import { createPrivateRoute } from '../services/private-route/create';
import { advancePrivateRoute } from '../services/private-route/state-machine';
import { PrivateRouteModel } from '../database/models/private-route';
import { cctpUsdc } from '../services/cctp';
import { PRIVACY_HUB_CHAIN_ID } from '../config/global-config';

function arg(name: string, fallback: string): string {
  const f = process.argv.find((a) => a.startsWith(`--${name}=`));
  return f ? f.slice(`--${name}=`.length) : fallback;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bal(chainId: number, addr: string, usdc: string): Promise<string> {
  try {
    return (Number(await chainManager.getTokenBalance(chainId, getAddress(addr), getAddress(usdc))) / 1e6).toFixed(6);
  } catch {
    return '?';
  }
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY / TEST_PRIVATE_KEY required');

  const amountHuman = arg('amount', '1');
  const sourceChainId = Number(arg('source', '84532'));
  const destChainId = Number(arg('dest', '84532'));
  const eoa = new ethers.Wallet(pk).address;
  const recipient = getAddress(arg('recipient', eoa));

  await chainManager.initialize();
  console.log(`\nInitializing Railgun engine on hub ${PRIVACY_HUB_CHAIN_ID} ...`);
  await initRailgunEngine(PRIVACY_HUB_CHAIN_ID);
  console.log(`Railgun ready=${isRailgunReady()} 0zk=${getRailgunAddress()?.slice(0, 20)}...\n`);

  // 1) Create a fresh route with current code.
  const created = await createPrivateRoute({
    sourceChainId,
    destChainId,
    amount: amountHuman,
    tokenSymbol: 'USDC',
    userDestinationAddress: recipient,
  });
  const routeId = created.routeId;
  const srcUsdc = cctpUsdc(sourceChainId);
  const hubUsdc = cctpUsdc(PRIVACY_HUB_CHAIN_ID);
  const dstUsdc = cctpUsdc(destChainId);
  const sourceSA = getAddress(created.depositAddress);
  console.log(
    `Route ${routeId}\n  ${sourceChainId} -> hub ${created.hubChainId} -> ${destChainId} | amount ${amountHuman} USDC` +
      ` | out ${Number(created.quotedOutputAmount) / 1e6}\n  source SA=${sourceSA} hubSA=${created.hubAccount} recipient=${recipient}\n`
  );

  // 2) Fund the source SA with USDC from the EOA (testnet, own accounts).
  const amount = ethers.parseUnits(amountHuman, 6);
  const provider = new ethers.JsonRpcProvider(process.env[`RPC_${sourceChainId}`] || (chainManager.getChain(sourceChainId) as unknown as { url: string }).url);
  const wallet = new ethers.Wallet(pk, provider);
  const usdc = new ethers.Contract(srcUsdc, ['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'], wallet);
  const saBalBefore: bigint = await usdc.balanceOf(sourceSA);
  if (saBalBefore < amount) {
    console.log(`→ funding source SA with ${amountHuman} USDC ...`);
    const tx = await usdc.transfer(sourceSA, amount);
    await tx.wait();
    console.log(`  funded: ${tx.hash}\n`);
  } else {
    console.log(`source SA already holds ${ethers.formatUnits(saBalBefore, 6)} USDC\n`);
  }
  const recvBefore = await bal(destChainId, recipient, dstUsdc);
  console.log(`recipient balance before: ${recvBefore} USDC (chain ${destChainId})\n`);

  // 3) Drive to terminal.
  const maxTicks = Number(arg('ticks', '300'));
  const intervalMs = Number(arg('interval', '6')) * 1000;
  let lastStatus = '';
  for (let i = 0; i < maxTicks; i++) {
    const route = await PrivateRouteModel.findById(routeId);
    if (!route) throw new Error('route vanished');
    if (route.status !== lastStatus) {
      const [saSrc, saHub, recv] = await Promise.all([
        bal(sourceChainId, sourceSA, srcUsdc),
        bal(PRIVACY_HUB_CHAIN_ID, route.hubAccount!, hubUsdc),
        bal(destChainId, recipient, dstUsdc),
      ]);
      console.log(
        `[tick ${i}] ${lastStatus || '—'} -> ${route.status} | SA.src=${saSrc} SA.hub=${saHub} recipient=${recv}` +
          (route.leg1RequestId ? ` | burn1=${route.leg1RequestId.slice(0, 12)}` : '') +
          (route.shieldTx ? ` | shield=${route.shieldTx.slice(0, 12)}` : '') +
          (route.unshieldTx ? ` | unshield=${route.unshieldTx.slice(0, 12)}` : '') +
          (route.leg2RequestId ? ` | burn2=${route.leg2RequestId.slice(0, 12)}` : '') +
          (route.error ? ` | ERROR=${route.error}` : '')
      );
      lastStatus = route.status;
    }
    if (route.status === 'COMPLETED') {
      const recv = await bal(destChainId, recipient, dstUsdc);
      console.log(`\n✅ COMPLETED. Recipient ${recipient} now holds ${recv} USDC on chain ${destChainId} (was ${recvBefore}).`);
      process.exit(0);
    }
    if (route.status === 'FAILED') {
      console.error(`\n❌ FAILED: ${route.error}`);
      process.exit(1);
    }
    try {
      await advancePrivateRoute(route);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string; cause?: { shortMessage?: string; message?: string } };
      console.log(`  (tick error, retry) ${err.shortMessage || err.message || String(e)}${err.cause ? ' | cause: ' + (err.cause.shortMessage || err.cause.message) : ''}`);
    }
    await sleep(intervalMs);
  }
  console.log(`\n⏱  ${maxTicks} ticks without terminal (status=${lastStatus}).`);
  process.exit(2);
}

main().catch((e) => {
  console.error('\n❌ e2e crashed:', e?.shortMessage || e?.message || e);
  process.exit(1);
});
