export const EREBUZ_SDK_VERSION = "0.0.0";

/** Chains Erebuz can be deployed to. Extend as new networks are supported. */
export const SUPPORTED_CHAINS = {
  localhost: 31337,
  sepolia: 11155111,
  mainnet: 1,
} as const;

export type ChainName = keyof typeof SUPPORTED_CHAINS;
export type ChainId = (typeof SUPPORTED_CHAINS)[ChainName];

/** Resolve a chain id from its name. */
export function getChainId(name: ChainName): ChainId {
  return SUPPORTED_CHAINS[name];
}

/** Shorten an EVM address for display, e.g. `0x1234…abcd`. */
export function shortenAddress(address: string, chars = 4): string {
  if (!address.startsWith("0x") || address.length < 2 + chars * 2) {
    return address;
  }
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export interface ErebuzConfig {
  chain: ChainName;
  rpcUrl?: string;
}

/** Create an Erebuz config with sensible defaults. */
export function createConfig(config: Partial<ErebuzConfig> = {}): ErebuzConfig {
  return {
    chain: config.chain ?? "localhost",
    rpcUrl: config.rpcUrl,
  };
}
