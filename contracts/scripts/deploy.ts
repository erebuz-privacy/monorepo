import { createConfig, getChainId, shortenAddress } from "@erebuz/sdk";

/**
 * Example deployment / tooling script.
 *
 * Demonstrates that on-chain tooling shares the same `@erebuz/sdk` as the app,
 * so chain ids, addresses and config stay consistent across the monorepo.
 *
 * Run with: `pnpm --filter @erebuz/contracts deploy:local`
 */
async function main(): Promise<void> {
  const config = createConfig({ chain: "localhost" });
  const chainId = getChainId(config.chain);

  console.log(`Deploying Erebuz to ${config.chain} (chainId ${chainId})`);

  // TODO: wire up a real deployment (forge script, viem, or ethers).
  const deployer = "0x0000000000000000000000000000000000000000";
  console.log(`Deployer: ${shortenAddress(deployer)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
