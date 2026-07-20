// Dev convenience: load local env files as a side effect on import, so the single
// TEE server (`pnpm start` / `pnpm dev`) is self-sufficient without the operator
// exporting secrets by hand. Only fills vars that are NOT already set, so real
// process env (Docker/Doppler) always wins — this is a no-op in those setups
// (the files won't exist in the container). Import this BEFORE any config module.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadFile(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// cwd is packages/tee for `pnpm start`; repo-root .env holds shared dev secrets.
loadFile(join(process.cwd(), '.env.railgun.local'));
loadFile(join(process.cwd(), '.env'));
loadFile(join(process.cwd(), '..', '..', '.env'));

// The app/tests use TEST_PRIVATE_KEY as the funded dev key; the services read PRIVATE_KEY.
if (!process.env.PRIVATE_KEY && process.env.TEST_PRIVATE_KEY) {
  process.env.PRIVATE_KEY = process.env.TEST_PRIVATE_KEY;
}
