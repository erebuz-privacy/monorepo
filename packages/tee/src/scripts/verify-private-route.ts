#!/usr/bin/env tsx

/**
 * /private-route health check.
 *
 * Black-box test of a RUNNING TEE over HTTP: chains -> tokens -> quote -> create
 * -> poll. It does NOT send any funds, so the route sits at AWAITING_DEPOSIT
 * (expected). Confirms the Relay discovery, quote, create (deposit address), and
 * status endpoints are all healthy. Exits non-zero if any check fails.
 *
 * Usage:
 *   pnpm --filter @erebuz/tee verify:route
 *   TEE_URL=http://localhost:3010 pnpm --filter @erebuz/tee verify:route
 *   tsx src/scripts/verify-private-route.ts --source=8453 --dest=137 --amount=5 --token=USDC --dest-token=USDT
 */

const TEE_URL = (process.env.TEE_URL || process.env.NEXT_PUBLIC_TEE_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
);

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const SOURCE = Number(arg('source', '8453')); // Base
const DEST = Number(arg('dest', '137')); // Polygon
const AMOUNT = arg('amount', '5');
const TOKEN = arg('token', 'USDC');
const DEST_TOKEN = arg('dest-token', TOKEN);
const RECIPIENT = arg('recipient', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
const POLLS = Math.max(1, Number(arg('polls', '2')));

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

let failures = 0;
const pass = (msg: string) => console.log(`${green('✓')} ${msg}`);
const fail = (msg: string) => {
  console.log(`${red('✗')} ${msg}`);
  failures += 1;
};

type Envelope<T> = { success?: boolean; data?: T; error?: string };

async function req<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: Envelope<T> | null }> {
  const res = await fetch(`${TEE_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RelayChain = { chainId: number; displayName: string };
type RelayToken = { symbol: string; address: string; decimals: number };
type Quote = { destSymbol: string; destDecimals: number; quotedOutputAmount: string; feeUsd: number | null; etaSeconds: number };
type Created = { routeId: string; depositAddress: string; hubAccount: string; hubIsSmartAccount: boolean };
type RouteRecord = { status: string; error?: string | null };

async function main(): Promise<void> {
  console.log(bold(`private-route health check → ${TEE_URL}`));
  console.log(dim(`route: ${AMOUNT} ${TOKEN} on chain ${SOURCE} → ${DEST_TOKEN} on chain ${DEST}`));
  console.log();

  // 1. chains
  try {
    const { ok, status, body } = await req<RelayChain[]>('/api/relay/chains');
    const n = body?.data?.length ?? 0;
    if (ok && body?.success && n > 0) pass(`chains: ${n} bridgeable`);
    else fail(`chains: unexpected response (${status})`);
  } catch (e) {
    fail(`chains: ${e instanceof Error ? e.message : String(e)} (is the TEE running?)`);
  }

  // 2. tokens on the hub (Arbitrum)
  try {
    const { ok, body } = await req<RelayToken[]>(`/api/relay/tokens?chainId=42161&search=${encodeURIComponent(TOKEN)}`);
    const token = (body?.data ?? []).find((t) => t.symbol?.toUpperCase() === TOKEN.toUpperCase());
    if (ok && token) pass(`tokens: ${TOKEN} on hub → ${token.address} (${token.decimals}dp)`);
    else fail(`tokens: ${TOKEN} not found on hub chain 42161`);
  } catch (e) {
    fail(`tokens: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. quote
  try {
    const { ok, body } = await req<Quote>('/api/private-route/quote', {
      method: 'POST',
      body: JSON.stringify({ sourceChainId: SOURCE, destChainId: DEST, amount: AMOUNT, tokenSymbol: TOKEN, destTokenSymbol: DEST_TOKEN }),
    });
    const q = body?.data;
    if (ok && body?.success && q?.quotedOutputAmount) {
      const out = Number(q.quotedOutputAmount) / 10 ** q.destDecimals;
      const fee = q.feeUsd != null ? `$${q.feeUsd.toFixed(2)}` : '—';
      pass(`quote: receive ~${out} ${q.destSymbol} (fee ${fee}, eta ~${Math.round(q.etaSeconds / 60)}m)`);
    } else {
      fail(`quote: ${body?.error ?? 'no output'}`);
    }
  } catch (e) {
    fail(`quote: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 4. create -> deposit address
  let routeId: string | null = null;
  try {
    const { ok, body } = await req<Created>('/api/private-route', {
      method: 'POST',
      body: JSON.stringify({
        sourceChainId: SOURCE,
        destChainId: DEST,
        amount: AMOUNT,
        tokenSymbol: TOKEN,
        destTokenSymbol: DEST_TOKEN,
        userDestinationAddress: RECIPIENT,
      }),
    });
    const c = body?.data;
    if (ok && body?.success && c?.depositAddress) {
      routeId = c.routeId;
      pass(`create: routeId ${c.routeId}`);
      console.log(dim(`   deposit ${AMOUNT} ${TOKEN} on chain ${SOURCE} → ${c.depositAddress}`));
      console.log(dim(`   hub account ${c.hubAccount} (AA ready: ${c.hubIsSmartAccount})`));
    } else {
      fail(`create: ${body?.error ?? 'no deposit address'}`);
    }
  } catch (e) {
    fail(`create: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 5. poll status
  if (routeId) {
    for (let i = 0; i < POLLS; i++) {
      try {
        const { ok, status, body } = await req<RouteRecord>(`/api/private-route/${routeId}`);
        if (ok && body?.success && body.data) {
          const err = body.data.error ? ` (${body.data.error})` : '';
          pass(`status[${i + 1}/${POLLS}]: ${body.data.status}${err}`);
        } else {
          fail(`status: unexpected response (${status})`);
        }
      } catch (e) {
        fail(`status: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (i < POLLS - 1) await sleep(3000);
    }
    console.log(
      dim('   (stays AWAITING_DEPOSIT — no funds were sent; shield/unshield need a live POI node + funded key)')
    );
  }

  console.log();
  if (failures === 0) {
    console.log(green(bold('PASS — private-route API is healthy')));
    process.exit(0);
  } else {
    console.log(red(bold(`FAIL — ${failures} check(s) failed`)));
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(red(`fatal: ${e instanceof Error ? e.message : String(e)}`));
  process.exit(1);
});
