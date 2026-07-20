// Canonical Biconomy Nexus (ERC-7579) contract addresses. Deployed at the SAME
// deterministic addresses on every supported chain, so instead of repeating this
// block in every chain config JSON, a config just sets `"nexus": true` and the
// loader injects these (see chain manager loadChainConfigs).

import type { Contract } from './chain';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const CANONICAL_NEXUS_CONTRACTS: Contract[] = [
  { name: 'nexusImplementation', address: '0x00000000383e8cBe298514674Ea60Ee1d1de50ac' },
  { name: 'nexusAccountFactory', address: '0x0000006648ED9B2B842552BE63Af870bC74af837' },
  { name: 'biconomyMetaFactory', address: '0x00000000000000447e69651d841bD8D104Bed493' },
  { name: 'k1Validator', address: '0x0000000031ef4155C978d48a8A7d4EDba03b04fE' },
  { name: 'nexusBootstrap', address: '0x0000003eDf18913c01cBc482C978bBD3D6E8ffA3' },
  { name: 'mockRegistry', address: '0x000000000069E2a187AEFFb852bF3cCdC95151B2' },
].map((c) => ({ ...c, transactionHash: ZERO_HASH, blockNumber: 0, verified: true, explorerLink: '' }));
