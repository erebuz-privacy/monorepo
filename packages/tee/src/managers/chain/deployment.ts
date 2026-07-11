// Chain Deployment Operations
// Handles smart account deployment on-chain

import type { Address, Hex } from 'viem';
import {
  encodeFunctionData,
  formatEther,
} from 'viem';
import { logger } from '../log';
import { chainManager } from './index';
import {
  BICONOMY_META_FACTORY_ABI,
  NEXUS_ACCOUNT_FACTORY_ABI,
} from '../../config/web3/abis';

/**
 * Result type for deployment operations
 */
export interface DeploymentResult {
  success: boolean;
  txHash?: Hex;
  gasUsed?: bigint;
  error?: string;
}

/**
 * ChainDeploymentManager
 * Handles smart account deployment operations
 */
export class ChainDeploymentManager {
  /**
   * Deploy a smart account on a specific chain
   * @param chainId - Target chain ID
   * @param accountAddress - Expected account address
   * @param initData - Initialization data
   * @param salt - Deterministic salt
   * @returns Deployment result
   */
  async deploySmartAccount(
    chainId: number,
    accountAddress: Address,
    initData: Hex,
    salt: Hex
  ): Promise<DeploymentResult> {
    try {
      const chain = chainManager.getChain(chainId);
      if (!chain) {
        throw new Error(`Chain ${chainId} not supported`);
      }
      const chainName = chain.name;

      logger.info(`Deploying smart account on chain ${chainName}`, 'ChainDeployment', {
        chainId,
        chainName,
        accountAddress,
      });

      const publicClient = chain.getPublicClient();
      const walletClient = chain.getWallet();

      if (!walletClient.account) {
        throw new Error('Wallet client does not have an account');
      }

      // Check if account is already deployed
      const code = await publicClient.getCode({ address: accountAddress });
      if (code && code !== '0x') {
        logger.info(`Account already deployed: ${accountAddress}`, 'ChainDeployment', {
          chainId,
          chainName,
        });
        return {
          success: true,
          txHash: '0x' as Hex,
          gasUsed: 0n,
        };
      }

      // Get factory contracts
      const biconomyMetaFactory = chain.getContractByName('biconomyMetaFactory');
      const nexusAccountFactory = chain.getNexusAccountFactory();

      if (!biconomyMetaFactory || !nexusAccountFactory) {
        throw new Error('Required factory contracts not found');
      }

      // Get current gas price
      const gasPrice = await publicClient.getGasPrice();
      logger.debug(`Gas price: ${formatEther(gasPrice)} ETH`, 'ChainDeployment', {
        chainId,
        chainName,
      });

      // Deploy via BiconomyMetaFactory
      const txHash = await walletClient.writeContract({
        address: biconomyMetaFactory.address as Address,
        abi: BICONOMY_META_FACTORY_ABI,
        functionName: 'deployWithFactory',
        args: [
          nexusAccountFactory.address as Address,
          encodeFunctionData({
            abi: NEXUS_ACCOUNT_FACTORY_ABI,
            functionName: 'createAccount',
            args: [initData, salt],
          }),
        ],
        account: walletClient.account,
        chain: chain.getViemChain(),
        gas: 2000000n,
        gasPrice,
      });

      logger.info(`Deployment transaction sent: ${txHash}`, 'ChainDeployment', {
        chainId,
        chainName,
        accountAddress,
      });

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 300000, // 5 minutes
      });

      logger.info(`Account deployed successfully`, 'ChainDeployment', {
        chainId,
        chainName,
        txHash,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber.toString(),
      });

      return {
        success: true,
        txHash,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Deployment failed`, 'ChainDeployment', {
        chainId,
        error,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

// Export singleton instance
export const chainDeploymentManager = new ChainDeploymentManager();
