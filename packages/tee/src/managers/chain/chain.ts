// Chain Manager

import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Chain as ViemChain } from 'viem';
import * as chains from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { logger } from '../log';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * True for JSON-RPC rate-limit responses (e.g. Arc's `-32011 "request limit
 * reached"`). These come back as HTTP-200 JSON-RPC errors, so viem's built-in
 * transport retry (which only fires on 4xx/5xx + network errors) never catches
 * them — we retry them ourselves below.
 */
function isRateLimited(err: unknown): boolean {
  const e = err as { code?: number; details?: string; message?: string; cause?: { code?: number; details?: string; message?: string } };
  const blob = `${e?.details ?? ''} ${e?.message ?? ''} ${e?.cause?.details ?? ''} ${e?.cause?.message ?? ''}`.toLowerCase();
  return (
    e?.code === -32011 ||
    e?.cause?.code === -32011 ||
    blob.includes('request limit') ||
    blob.includes('rate limit') ||
    blob.includes('too many requests') ||
    blob.includes('-32011') ||
    blob.includes('429')
  );
}

/**
 * viem HTTP transport that transparently retries rate-limited RPC calls with
 * exponential backoff + jitter. Lets a tight public RPC (e.g. Arc's) sustain the
 * multi-call bursts an AA UserOp needs, without a keyed endpoint.
 */
function retryingHttp(url: string, { retries = 6, baseMs = 600 }: { retries?: number; baseMs?: number } = {}) {
  const inner = http(url, { timeout: 20_000 });
  return (params: Parameters<ReturnType<typeof http>>[0]) => {
    const transport = inner(params);
    const originalRequest = transport.request;
    const request = (async (args: unknown, opts?: unknown) => {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await (originalRequest as (a: unknown, o?: unknown) => Promise<unknown>)(args, opts);
        } catch (err) {
          lastErr = err;
          if (!isRateLimited(err) || attempt === retries) throw err;
          // Deterministic jitter (no Math.random) keyed off the attempt.
          const jitter = (attempt * 137) % 250;
          await sleep(baseMs * 2 ** attempt + jitter);
        }
      }
      throw lastErr;
    }) as typeof originalRequest;
    return { ...transport, request };
  };
}

/**
 * Get chain by ID from viem/chains
 */
function getChainById(chainId: number): ViemChain | undefined {
  const chainsArray = Object.values(chains) as ViemChain[];
  return chainsArray.find((chain) => chain.id === chainId);
}

/**
 * Contract information
 */
export interface Contract {
  name?: string;
  address: string;
  transactionHash: string;
  blockNumber: number;
  verified: boolean;
  explorerLink: string; // Chain explorer link (e.g., Etherscan, Arbiscan)
}

/**
 * Chain token information
 */
export interface ChainToken {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
}

/**
 * Deployed module information on a chain
 */
export interface DeployedModule {
  name: string;
  address: string;
  transactionHash: string;
  blockNumber: number;
  verified: boolean;
  explorerLink: string; // Chain explorer link (e.g., Etherscan, Arbiscan)
  configHash: string;
  configuration: unknown; // Configuration is different per module, so it's flexible
}

/**
 * Chain configuration interface
 */
export interface ChainConfig {
  id: number;
  address: string; // Chain identifier/address
  name: string;
  url: string; // RPC URL
  tokens: ChainToken[];
  modules: DeployedModule[];
  /** When true, the loader injects the canonical Nexus contracts (see nexus-contracts.ts). */
  nexus?: boolean;
  /**
   * When true, the native gas token IS the USDC being moved (e.g. Arc, where USDC
   * is native with a unified native/ERC-20 balance). Gas paid by a UserOp therefore
   * eats into the same balance we want to CCTP-burn, so the AA layer must top the
   * account up with gas UNCONDITIONALLY (on top of the deposit) rather than skipping
   * the top-up when the "native" balance looks sufficient.
   */
  unifiedGasToken?: boolean;
  contracts?: Contract[];
}

/**
 * Chain class representing a blockchain network
 */
export class Chain {
  public readonly id: number;
  public readonly address: string;
  public readonly name: string;
  public readonly url: string;
  public readonly tokens: ChainToken[];
  public readonly modules: DeployedModule[];
  public readonly contracts: Contract[];
  public readonly unifiedGasToken: boolean;

  // Singleton instances per chain
  private publicClient: PublicClient | null = null;
  private wallet: WalletClient | null = null;
  private viemChain: ViemChain | null = null;

  constructor(config: ChainConfig) {
    this.id = config.id;
    this.address = config.address;
    this.name = config.name;
    this.url = config.url;
    this.tokens = config.tokens;
    this.modules = config.modules;
    this.contracts = config.contracts ?? [];
    this.unifiedGasToken = config.unifiedGasToken ?? false;
  }

  /**
   * Get the viem chain configuration for this chain ID
   */
  getViemChain(): ViemChain {
    if (!this.viemChain) {
      const chain = getChainById(this.id);
      if (!chain) {
        throw new Error(`Chain with ID ${this.id} not found in viem/chains`);
      }
      this.viemChain = chain;
    }
    return this.viemChain;
  }

  /**
   * Get or create a public client for this chain
   * Public client is used to read information from the chain
   * @returns Public client instance (singleton per chain)
   */
  getPublicClient(): PublicClient {
    if (!this.publicClient) {
      logger.debug(`Creating public client for chain ${this.name}`, 'Chain');
      this.publicClient = this.createPublicClient();
    }
    return this.publicClient;
  }

  /**
   * Get or create a wallet for this chain
   * Wallet is used to write information to the chain
   * @returns Wallet instance (singleton per chain)
   */
  getWallet(): WalletClient {
    if (!this.wallet) {
      logger.debug(`Creating wallet for chain ${this.name}`, 'Chain');
      this.wallet = this.createWallet();
    }
    return this.wallet;
  }

  /**
   * Create a public client instance
   * @private
   */
  private createPublicClient(): PublicClient {
    const chain = this.getViemChain();

    return createPublicClient({
      transport: retryingHttp(this.url),
      chain,
    });
  }

  /**
   * Create a wallet instance for this chain
   * @private
   */
  private createWallet(): WalletClient {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY environment variable is not set');
    }

    const chain = this.getViemChain();

    // Convert private key to account
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    return createWalletClient({
      transport: retryingHttp(this.url),
      chain,
      account,
    });
  }

  /**
   * Get a contract by address
   */
  getContract(contractAddress: string): Contract | undefined {
    return this.contracts.find(
      (contract) => contract.address.toLowerCase() === contractAddress.toLowerCase()
    );
  }

  /**
   * Get all contracts
   */
  getContracts(): Contract[] {
    return this.contracts;
  }

  /**
   * Check if a token is supported on this chain by symbol
   */
  isTokenSupported(tokenSymbol: string): boolean {
    return this.tokens.some((token) => token.symbol.toLowerCase() === tokenSymbol.toLowerCase());
  }

  /**
   * Get token information by symbol
   */
  getTokenInfo(tokenSymbol: string): ChainToken | undefined {
    return this.tokens.find(
      (token) => token.symbol.toLowerCase() === tokenSymbol.toLowerCase()
    );
  }

  /**
   * Check if a module is known on this chain by address
   */
  isModuleKnown(moduleAddress: string): boolean {
    return this.modules.some((module) => module.address.toLowerCase() === moduleAddress.toLowerCase());
  }

  /**
   * Get module information by address
   */
  getModuleInfo(moduleAddress: string): DeployedModule | undefined {
    return this.modules.find(
      (module) => module.address.toLowerCase() === moduleAddress.toLowerCase()
    );
  }

  /**
   * Get all modules
   */
  getModules(): DeployedModule[] {
    return this.modules;
  }

  /**
   * Get contract by name/role
   */
  getContractByName(name: string): Contract | undefined {
    return this.contracts.find((contract) => {
      return contract.name?.toLowerCase() === name.toLowerCase();
    });
  }

  /**
   * Get nexus account factory contract
   */
  getNexusAccountFactory(): Contract | undefined {
    return this.getContractByName('nexusAccountFactory');
  }

  /**
   * Get nexus bootstrap contract
   */
  getNexusBootstrap(): Contract | undefined {
    return this.getContractByName('nexusBootstrap');
  }

  /**
   * Get mock registry contract
   */
  getMockRegistry(): Contract | undefined {
    return this.getContractByName('mockRegistry');
  }

  /**
   * Clear cached client and wallet instances
   */
  clearCache(): void {
    this.publicClient = null;
    this.wallet = null;
    logger.debug(`Cleared cache for chain ${this.name}`, 'Chain');
  }
}

