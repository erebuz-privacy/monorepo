// Block-explorer links per chain, including the non-EVM ones (Starknet uses
// Starkscan, Arc uses Arcscan). Keyed by the same chain ids the TEE reports, so
// 23448594 is our synthetic id for Starknet Sepolia.

const EXPLORER_TX: Record<number, string> = {
  // testnet
  84532: "https://sepolia.basescan.org/tx/",
  421614: "https://sepolia.arbiscan.io/tx/",
  11155111: "https://sepolia.etherscan.io/tx/",
  11155420: "https://sepolia-optimism.etherscan.io/tx/",
  80002: "https://amoy.polygonscan.com/tx/",
  1301: "https://sepolia.uniscan.xyz/tx/",
  4801: "https://sepolia.worldscan.org/tx/",
  1328: "https://seitrace.com/tx/",
  5042002: "https://testnet.arcscan.app/tx/",
  23448594: "https://sepolia.starkscan.co/tx/",
  // mainnet
  1: "https://etherscan.io/tx/",
  10: "https://optimistic.etherscan.io/tx/",
  137: "https://polygonscan.com/tx/",
  8453: "https://basescan.org/tx/",
  42161: "https://arbiscan.io/tx/",
};

const EXPLORER_NAME: Record<number, string> = {
  84532: "Basescan",
  421614: "Arbiscan",
  11155111: "Etherscan",
  11155420: "Etherscan",
  80002: "Polygonscan",
  1301: "Uniscan",
  4801: "Worldscan",
  1328: "Seitrace",
  5042002: "Arcscan",
  23448594: "Starkscan",
  1: "Etherscan",
  10: "Etherscan",
  137: "Polygonscan",
  8453: "Basescan",
  42161: "Arbiscan",
};

/** Explorer URL for a tx hash on a chain, or null when we have no explorer for it. */
export function explorerTxUrl(chainId: number | undefined, txHash: string | null | undefined): string | null {
  if (chainId == null || !txHash) return null;
  const base = EXPLORER_TX[chainId];
  return base ? `${base}${txHash}` : null;
}

export function explorerName(chainId: number | undefined): string {
  return (chainId != null ? EXPLORER_NAME[chainId] : undefined) ?? "explorer";
}
