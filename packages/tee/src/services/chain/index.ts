// Chain Service

import { chainManager } from '../../managers/chain';
import type { Address } from 'viem';
import type { StealthUser } from '../../database/models/stealth-user';

export class ChainService {
  /**
   * Get all supported chain IDs
   */
  static getAllChainIds(): number[] {
    return chainManager.getAllChains();
  }

  /**
   * Get chain information by ID
   */
  static getChain(chainId: number) {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return null;
    }

    return {
      id: chain.id,
      name: chain.name,
      address: chain.address,
      url: chain.url,
      tokens: chain.tokens,
      modules: chain.modules,
      contracts: chain.contracts,
    };
  }

  /**
   * Check if a chain is supported
   */
  static isChainSupported(chainId: number): boolean {
    return chainManager.isChainSupported(chainId);
  }

  /**
   * Compute smart account address for a user
   */
  static async computeSmartAccountAddress(
    user: StealthUser,
    chainId: number,
    ownerAddress: Address
  ) {
    return await chainManager.computeSmartAccountAddress(user, chainId, ownerAddress);
  }

  /**
   * Get resolved address (smart account or stealth) based on privacy settings
   */
  static async getResolvedAddress(
    user: StealthUser,
    chainId: number,
    stealthAddress?: Address
  ) {
    return await chainManager.getResolvedAddress(user, chainId, stealthAddress);
  }

  /**
   * Get chain token information
   */
  static getTokenInfo(chainId: number, tokenSymbol: string) {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return null;
    }
    return chain.getTokenInfo(tokenSymbol);
  }

  /**
   * Check if a token is supported on a chain
   */
  static isTokenSupported(chainId: number, tokenSymbol: string): boolean {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return false;
    }
    return chain.isTokenSupported(tokenSymbol);
  }

  /**
   * Get all contracts for a chain
   */
  static getContracts(chainId: number) {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return null;
    }
    return chain.getContracts();
  }

  /**
   * Get contract by address
   */
  static getContract(chainId: number, contractAddress: string) {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return null;
    }
    return chain.getContract(contractAddress);
  }

  /**
   * Get contract by name
   */
  static getContractByName(chainId: number, contractName: string) {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return null;
    }
    return chain.getContractByName(contractName);
  }

  /**
   * Check if a module is known on a chain
   */
  static isModuleKnown(chainId: number, moduleAddress: string): boolean {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return false;
    }
    return chain.isModuleKnown(moduleAddress);
  }

  /**
   * Get module information by address
   */
  static getModuleInfo(chainId: number, moduleAddress: string) {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return null;
    }
    return chain.getModuleInfo(moduleAddress);
  }
}
