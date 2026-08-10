// Chain Manager - Exports Chain class and related types
// ChainManager manages all chain instances

import { Chain, type ChainConfig } from './chain';
import { CANONICAL_NEXUS_CONTRACTS } from './nexus-contracts';
import { logger } from '../log';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { moduleManager } from './module';
import type { Address } from 'viem';
import type { StealthUser } from '../../database/models/stealth-user';
import type { SmartAccountComputationResult, SmartAccountModule } from './types';
import { NEXUS_ACCOUNT_FACTORY_ABI, NEXUS_BOOTSTRAP_ABI } from '../../config/web3/abis';
import { encodeAbiParameters, encodeFunctionData, keccak256, toBytes, getAddress, bytesToHex } from 'viem';

/**
 * Chain config directory path
 */
const CHAIN_CONFIG_DIR = join(process.cwd(), 'src/config/web3/chains');

// Re-export types for convenience
export type { SmartAccountComputationResult, SmartAccountModule } from './types';

/**
 * ChainManager class to manage all blockchain chains
 */
class ChainManager {
  private chains: Map<number, Chain> = new Map(); // Chain ID -> Chain instance
  public readonly moduleManager: typeof moduleManager; // Singleton instance of ModuleManager
  private initialized: boolean = false;

  constructor() {
    // Reference to the singleton ModuleManager instance
    this.moduleManager = moduleManager;

    // Load all chain configs from the config/web3/chains folder during initialization
    this.loadChainConfigs().catch((error) => {
      logger.error('Failed to load chain configs during initialization', 'ChainManager', error);
    });
  }

  /**
   * Initialize the chain manager (ensures configs are loaded)
   * Call this before using the manager in scripts
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadChainConfigs();
    this.initialized = true;
  }

  /**
   * Load all chain configurations from the config/web3/chains folder
   * @private
   */
  private async loadChainConfigs(): Promise<void> {
    try {
      // Check if config directory exists
      const files = await readdir(CHAIN_CONFIG_DIR);
      
      // Filter for JSON files
      const jsonFiles = files.filter((file) => file.endsWith('.json') && !file.startsWith('._'));

      // Load and register each chain config
      for (const file of jsonFiles) {
        try {
          const filePath = join(CHAIN_CONFIG_DIR, file);
          const fileContent = await readFile(filePath, 'utf-8');
          const chainConfig = JSON.parse(fileContent) as ChainConfig;

          // `"nexus": true` injects the canonical Nexus contracts (deployed at the
          // same address on every chain) instead of repeating them in each JSON.
          if (chainConfig.nexus) {
            chainConfig.contracts = [...CANONICAL_NEXUS_CONTRACTS, ...(chainConfig.contracts ?? [])];
          }

          this.registerChain(chainConfig);
          logger.info(`Loaded chain config: ${chainConfig.name} (ID: ${chainConfig.id}) from ${file}`, 'ChainManager');
        } catch (error) {
          logger.error(`Failed to load chain config from ${file}`, 'ChainManager', error);
        }
      }

      logger.info(`Loaded ${jsonFiles.length} chain configuration(s)`, 'ChainManager');
    } catch (error) {
      // Directory might not exist yet, which is okay
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to read chain config directory', 'ChainManager', error);
      }
    }
  }

  /**
   * Register a new chain with the manager
   */
  registerChain(config: ChainConfig): Chain {
    // Check if chain with same ID already exists
    if (this.chains.has(config.id)) {
      logger.warn(`Chain with ID ${config.id} is already registered`, 'ChainManager');
      const existingChain = this.chains.get(config.id);
      if (!existingChain) {
        throw new Error(`Chain ${config.id} was expected to exist but was not found`);
      }
      return existingChain;
    }

    const chain = new Chain(config);
    this.chains.set(config.id, chain);

    logger.info(`Registered chain: ${config.name} (ID: ${config.id})`, 'ChainManager');
    return chain;
  }

  /**
   * Get all supported chain IDs
   * @returns Array of all registered chain IDs
   */
  getAllChains(): number[] {
    return Array.from(this.chains.keys());
  }

  /**
   * Get a chain by ID
   */
  getChain(chainId: number): Chain | undefined {
    return this.chains.get(chainId);
  }

  /**
   * Check if a chain is supported
   */
  isChainSupported(chainId: number): boolean {
    return this.chains.has(chainId);
  }

  /**
   * Get modules for a specific chain by filtering user modules against chain-supported modules
   * @param chainId - The target chain ID
   * @param userModules - User modules from StealthUser.modules (JSON array)
   * @returns Array of filtered modules that are supported by the chain
   */
  getModulesForChain(chainId: number, userModules: unknown): SmartAccountModule[] {
    const chain = this.chains.get(chainId);
    if (!chain) {
      logger.warn(`Chain ${chainId} not found, returning empty modules`, 'ChainManager');
      return [];
    }

    // Parse user modules from JSON
    let parsedModules: unknown[] = [];
    if (userModules) {
      try {
        if (typeof userModules === 'string') {
          const parsed = JSON.parse(userModules);
          parsedModules = Array.isArray(parsed) ? parsed : [];
        } else if (Array.isArray(userModules)) {
          parsedModules = userModules;
        } else if (typeof userModules === 'object') {
          parsedModules = Array.isArray(userModules) ? userModules : [];
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to parse user modules: ${errorMsg}`, 'ChainManager');
        return [];
      }
    }

    // Get chain-supported modules
    const chainSupportedModules = chain.getModules();
    const chainModuleAddresses = new Set(
      chainSupportedModules.map((module) => module.address.toLowerCase())
    );

    // Filter user modules to only include those supported by the chain and matching chainId
    const filteredModules: SmartAccountModule[] = [];
    for (const userModule of parsedModules) {
      try {
        // Type guard: ensure userModule is an object with required properties
        if (typeof userModule !== 'object' || userModule === null) {
          continue;
        }
        
        const module = userModule as Record<string, unknown>;
        
        // Check if module has required fields
        if (!module.address || !module.chainId) {
          continue;
        }

        // Check if chainId matches
        if (Number(module.chainId) !== chainId) {
          continue;
        }

        // Check if module address is supported by the chain
        const moduleAddress = String(module.address).toLowerCase();
        if (!chainModuleAddresses.has(moduleAddress)) {
          logger.debug(
            `Module ${moduleAddress} is not supported by chain ${chainId}`,
            'ChainManager'
          );
          continue;
        }

        // Add to filtered modules
        filteredModules.push({
          address: module.address as Address,
          data: (module.data || '0x') as `0x${string}`,
          chainId: Number(module.chainId),
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to process module: ${errorMsg}`, 'ChainManager');
        continue;
      }
    }

    logger.info(
      `Filtered ${filteredModules.length} supported modules from ${parsedModules.length} user modules for chain ${chainId}`,
      'ChainManager'
    );

    return filteredModules;
  }

  /**
   * Compute smart account address for a user with modules on a specific chain
   * @param user - The stealth user data
   * @param chainId - The target chain ID
   * @param ownerAddress - The owner address (EOA when privacy disabled, stealth when privacy enabled)
   * @returns Smart account computation result
   */
  async computeSmartAccountAddress(
    user: StealthUser,
    chainId: number,
    ownerAddress: Address
  ): Promise<SmartAccountComputationResult> {
    try {
      logger.info(`Computing smart account for chain ${chainId}`, 'SmartAccount');
      logger.info(`Owner: ${ownerAddress}`, 'SmartAccount');
      logger.info(`Privacy enabled: ${user.privacyEnabled}`, 'SmartAccount');

      // Get chain
      const chain = this.chains.get(chainId);
      if (!chain) {
        return {
          success: false,
          error: `Unsupported chain ID: ${chainId}`,
        };
      }

      // Get public client
      const publicClient = chain.getPublicClient();
      if (!publicClient) {
        return {
          success: false,
          error: `No public client available for chain ${chainId}`,
        };
      }

      // Get filtered modules
      const modules = this.getModulesForChain(chainId, user.modules);

      // Get required contracts
      const nexusAccountFactory = chain.getNexusAccountFactory();
      const nexusBootstrap = chain.getNexusBootstrap();
      const mockRegistry = chain.getMockRegistry();

      if (!nexusAccountFactory) {
        return {
          success: false,
          error: 'Nexus Account Factory contract not found',
        };
      }

      if (!nexusBootstrap) {
        return {
          success: false,
          error: 'Nexus Bootstrap contract not found',
        };
      }

      if (!mockRegistry) {
        return {
          success: false,
          error: 'Mock Registry contract not found',
        };
      }

      logger.info(`Found ${modules.length} modules for chain ${chainId}`, 'SmartAccount');

      if (modules.length === 0) {
        // No modules for this chain, return the owner address directly
        logger.info(`No modules for chain ${chainId}, returning owner address`, 'SmartAccount');
        return {
          success: true,
          smartAccountAddress: ownerAddress,
          computationDetails: {
            owner: ownerAddress,
            modules: [],
            chainId,
            salt: '0x',
            initData: '0x',
          },
        };
      }

      // For now, work with just the first module (single module approach)
      const primaryModule = modules[0];
      logger.info(`Using single module: ${primaryModule.address}`, 'SmartAccount');

      // Prepare bootstrap configuration parameters
      const validators: Array<{ module: Address; data: `0x${string}` }> = [];
      const executors = [
        {
          module: primaryModule.address,
          data: primaryModule.data,
        },
      ];
      const hook = {
        module: '0x0000000000000000000000000000000000000000' as Address,
        data: '0x' as `0x${string}`,
      };
      const fallbacks: Array<{ module: Address; data: `0x${string}` }> = [];

      // Use the owner address as attester
      const registryConfig = {
        registry: mockRegistry.address as Address,
        attesters: [ownerAddress], // Account owner (stealth or EOA)
        threshold: 1,
      };

      logger.info(`Bootstrap Configuration:`, 'SmartAccount');
      logger.info(`  Owner Address: ${ownerAddress}`, 'SmartAccount');
      logger.info(`  Registry: ${registryConfig.registry}`, 'SmartAccount');
      logger.info(`  Attesters: ${registryConfig.attesters.join(', ')}`, 'SmartAccount');
      logger.info(`  Threshold: ${registryConfig.threshold}`, 'SmartAccount');
      logger.info(`  Module: ${executors[0].module}`, 'SmartAccount');
      logger.info(`  Module Data: ${executors[0].data}`, 'SmartAccount');

      // Convert owner address to bytes format (as expected by the ABI)
      // The ABI expects defaultValidatorInitData as bytes, so we encode the address
      // Convert address to bytes (20 bytes) and then to hex string
      const defaultValidatorInitData = bytesToHex(toBytes(getAddress(ownerAddress)));

      const initNexusData = encodeFunctionData({
        abi: NEXUS_BOOTSTRAP_ABI,
        functionName: 'initNexusWithDefaultValidatorAndOtherModules',
        args: [defaultValidatorInitData, validators, executors, hook, fallbacks, [], registryConfig],
      });

      // Create full initialization data
      const initData = encodeAbiParameters(
        [{ type: 'address' }, { type: 'bytes' }],
        [nexusBootstrap.address as Address, initNexusData]
      );

      // Generate deterministic salt based on user address only
      const salt = keccak256(toBytes(user.eoaAddress));

      logger.info(`Encoded Data:`, 'SmartAccount');
      logger.info(`  Init Nexus Data: ${initNexusData}`, 'SmartAccount');
      logger.info(`  Full Init Data: ${initData}`, 'SmartAccount');
      logger.info(`  Salt: ${salt}`, 'SmartAccount');
      logger.info(`  EOA Address: ${user.eoaAddress}`, 'SmartAccount');

      // Compute the smart account address by calling the contract
      const smartAccountAddress = (await publicClient.readContract({
        address: nexusAccountFactory.address as Address,
        abi: NEXUS_ACCOUNT_FACTORY_ABI,
        functionName: 'computeAccountAddress',
        args: [initData, salt],
      }));

      logger.info(`Computed smart account: ${smartAccountAddress}`, 'SmartAccount');

      return {
        success: true,
        smartAccountAddress,
        computationDetails: {
          owner: ownerAddress,
          modules: modules,
          chainId,
          salt,
          initData,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error computing smart account: ${errorMessage}`, 'SmartAccount', error);
      logger.warn(
        `Falling back to owner address ${ownerAddress} for chain ${chainId}`,
        'SmartAccount'
      );
      return {
        success: true,
        smartAccountAddress: ownerAddress,
        computationDetails: {
          owner: ownerAddress,
          modules: [],
          chainId,
          salt: '0x',
          initData: '0x',
        },
      };
    }
  }

  /**
   * Get the appropriate address to return for a user based on privacy settings
   * @param user - The stealth user data
   * @param chainId - The target chain ID
   * @param stealthAddress - The stealth address (if privacy enabled)
   * @returns The address to return (stealth or smart account)
   */
  async getResolvedAddress(
    user: StealthUser,
    chainId: number,
    stealthAddress?: Address
  ): Promise<SmartAccountComputationResult> {
    try {
      if (user.privacyEnabled && stealthAddress) {
        // Privacy enabled: compute smart account with stealth address as owner
        logger.info(`Privacy enabled, computing smart account with stealth owner`, 'ChainManager');
        return await this.computeSmartAccountAddress(user, chainId, stealthAddress);
      } else {
        // Privacy disabled: compute smart account with main EOA as owner
        logger.info(`Privacy disabled, computing smart account with EOA owner`, 'ChainManager');
        return await this.computeSmartAccountAddress(user, chainId, user.eoaAddress as Address);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error resolving address: ${errorMessage}`, 'ChainManager', error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get token balance on a specific chain
   * @param chainId - Target chain ID
   * @param accountAddress - Account to check
   * @param tokenAddress - Token contract address
   * @returns Token balance
   */
  async getTokenBalance(
    chainId: number,
    accountAddress: Address,
    tokenAddress: Address
  ): Promise<bigint> {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    const publicClient = chain.getPublicClient();

    const balance = (await publicClient.readContract({
      address: tokenAddress,
      abi: [
        {
          inputs: [{ name: 'owner', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const,
      functionName: 'balanceOf',
      args: [accountAddress],
    })) as unknown;

    return balance as bigint;
  }

  /**
   * Get wallet balance and gas funding status
   * @param chainId - Target chain ID
   * @returns Funding status
   */
  async getGasFunding(chainId: number): Promise<{
    hasSufficientFunds: boolean;
    currentBalance: bigint;
    estimatedGasFee: bigint;
    shortfall?: bigint;
    walletAddress: Address;
  }> {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    const publicClient = chain.getPublicClient();
    const walletClient = chain.getWallet();

    // Ensure wallet has an account
    if (!walletClient.account) {
      throw new Error('Wallet client does not have an account');
    }

    const currentBalance = await publicClient.getBalance({
      address: walletClient.account.address,
    });

    const gasPrice = await publicClient.getGasPrice();
    const estimatedGasLimit = 2000000n;
    const estimatedGasFee = estimatedGasLimit * gasPrice;

    const hasSufficientFunds = currentBalance >= estimatedGasFee;
    const shortfall = hasSufficientFunds ? undefined : estimatedGasFee - currentBalance;

    // Import formatEther for logging
    const { formatEther } = await import('viem');
    
    logger.info(`Gas funding check for chain ${chainId}:`, 'ChainManager', {
      wallet: walletClient.account.address,
      balance: `${formatEther(currentBalance)} ETH`,
      estimatedGasFee: `${formatEther(estimatedGasFee)} ETH`,
      sufficientFunds: hasSufficientFunds,
      shortfall: shortfall ? `${formatEther(shortfall)} ETH` : undefined,
    });

    return {
      hasSufficientFunds,
      currentBalance,
      estimatedGasFee,
      shortfall,
      walletAddress: walletClient.account.address,
    };
  }

  /**
   * Get wallet address for a specific chain
   * @param chainId - Target chain ID
   * @returns Wallet address
   */
  getWalletAddress(chainId: number): Address {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    const walletClient = chain.getWallet();
    if (!walletClient.account) {
      throw new Error('Wallet client does not have an account');
    }
    return walletClient.account.address;
  }
}

// Create and export singleton instance
export const chainManager = new ChainManager();

// Export Chain class and types
export * from './chain';

// Export Module class and types
export * from './module';

// Export module encoders
export * from './module-encoders';

// Export deployment manager
export * from './deployment';
