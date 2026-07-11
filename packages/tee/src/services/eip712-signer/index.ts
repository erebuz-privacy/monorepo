// EIP-712 Typed Data Signer for NearIntentBridgeModule
// Signs InstallConfig and ExecuteTransfer typed data

import { type Address, type Hex, encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { logger } from '../../managers/log';

// EIP-712 Domain
const EIP712_DOMAIN = {
  name: 'NearIntentBridgeModule',
  version: '1',
} as const;

// Type definitions matching the Solidity contract
// Note: account is not included to avoid circular dependency
const INSTALL_CONFIG_TYPE = {
  InstallConfig: [
    { name: 'tokens', type: 'address[]' },
    { name: 'maxAmounts', type: 'uint256[]' },
    { name: 'expiry', type: 'uint256' },
    { name: 'startTime', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

const EXECUTE_TRANSFER_TYPE = {
  ExecuteTransfer: [
    { name: 'account', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'to', type: 'address' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

export interface InstallConfigData {
  tokens: Address[];
  maxAmounts: bigint[];
  expiry: bigint;
  startTime: bigint;
  nonce: bigint;
}

export interface ExecuteTransferData {
  account: Address;
  token: Address;
  amount: bigint;
  to: Address;
  expiry: bigint;
  nonce: bigint;
}

export interface SignedInstallConfig {
  tokens: Address[];
  maxAmounts: bigint[];
  expiry: bigint;
  startTime: bigint;
  signature: Hex;
}

export interface SignedExecuteTransfer {
  token: Address;
  amount: bigint;
  to: Address;
  account: Address;
  expiry: bigint;
  signature: Hex;
}

/**
 * EIP-712 Signer for NearIntentBridgeModule
 */
export class EIP712Signer {
  private privateKey: Hex;
  private account: ReturnType<typeof privateKeyToAccount>;

  constructor(privateKey: Hex) {
    this.privateKey = privateKey;
    this.account = privateKeyToAccount(privateKey);
  }

  /**
   * Get the signer address
   */
  getAddress(): Address {
    return this.account.address;
  }

  /**
   * Sign InstallConfig typed data
   */
  async signInstallConfig(
    chainId: number,
    verifyingContract: Address,
    data: InstallConfigData
  ): Promise<SignedInstallConfig> {
    try {
      const domain = {
        ...EIP712_DOMAIN,
        chainId,
        verifyingContract,
      };

      const message = {
        tokens: data.tokens,
        maxAmounts: data.maxAmounts,
        expiry: data.expiry,
        startTime: data.startTime,
        nonce: data.nonce,
      };

      const signature = await this.account.signTypedData({
        domain,
        types: INSTALL_CONFIG_TYPE,
        primaryType: 'InstallConfig',
        message,
      });

      logger.info('Signed InstallConfig', 'EIP712Signer', {
        tokens: data.tokens.length,
        chainId,
      });

      return {
        tokens: data.tokens,
        maxAmounts: data.maxAmounts,
        expiry: data.expiry,
        startTime: data.startTime,
        signature,
      };
    } catch (error) {
      logger.error('Failed to sign InstallConfig', 'EIP712Signer', error);
      throw error;
    }
  }

  /**
   * Sign ExecuteTransfer typed data
   */
  async signExecuteTransfer(
    chainId: number,
    verifyingContract: Address,
    data: ExecuteTransferData
  ): Promise<SignedExecuteTransfer> {
    try {
      const domain = {
        ...EIP712_DOMAIN,
        chainId,
        verifyingContract,
      };

      const message = {
        account: data.account,
        token: data.token,
        amount: data.amount,
        to: data.to,
        expiry: data.expiry,
        nonce: data.nonce,
      };

      const signature = await this.account.signTypedData({
        domain,
        types: EXECUTE_TRANSFER_TYPE,
        primaryType: 'ExecuteTransfer',
        message,
      });

      logger.info('Signed ExecuteTransfer', 'EIP712Signer', {
        account: data.account,
        token: data.token,
        to: data.to,
        chainId,
      });

      return {
        token: data.token,
        amount: data.amount,
        to: data.to,
        account: data.account,
        expiry: data.expiry,
        signature,
      };
    } catch (error) {
      logger.error('Failed to sign ExecuteTransfer', 'EIP712Signer', error);
      throw error;
    }
  }
}

// Singleton instance - lazy initialized
let signerInstance: EIP712Signer | null = null;

/**
 * Get the EIP-712 signer instance
 */
export function getEIP712Signer(): EIP712Signer {
  if (!signerInstance) {
    const privateKey = process.env.PRIVATE_KEY as Hex;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY environment variable not set');
    }
    signerInstance = new EIP712Signer(privateKey);
  }
  return signerInstance;
}

/**
 * Create install config data for a user
 * @param account Smart account address
 * @param tokens Allowed token addresses
 * @param maxAmounts Maximum amounts per token
 * @param validityDuration How long the config is valid (in seconds)
 * @param nonce Current install nonce for the account
 */
export function createInstallConfigData(
  tokens: Address[],
  maxAmounts: bigint[],
  validityDuration: number,
  nonce: bigint
): InstallConfigData {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return {
    tokens,
    maxAmounts,
    expiry: now + BigInt(validityDuration),
    startTime: now,
    nonce,
  };
}

/**
 * Create execute transfer data
 * @param account Smart account address
 * @param token Token to transfer
 * @param amount Amount to transfer
 * @param to Destination address
 * @param validityDuration How long the signature is valid (in seconds)
 * @param nonce Current execute nonce for the account
 */
export function createExecuteTransferData(
  account: Address,
  token: Address,
  amount: bigint,
  to: Address,
  validityDuration: number,
  nonce: bigint
): ExecuteTransferData {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return {
    account,
    token,
    amount,
    to,
    expiry: now + BigInt(validityDuration),
    nonce,
  };
}

/**
 * Encode install config data for onInstall call
 */
export function encodeInstallData(config: SignedInstallConfig): Hex {
  // ABI encode: (address[] tokens, uint256[] maxAmounts, uint256 expiry, uint256 startTime, bytes signature)
  const { tokens, maxAmounts, expiry, startTime, signature } = config;

  // Use viem's encodeAbiParameters
  const { encodeAbiParameters, parseAbiParameters } = require('viem');

  return encodeAbiParameters(
    parseAbiParameters('address[], uint256[], uint256, uint256, bytes'),
    [tokens, maxAmounts, expiry, startTime, signature]
  );
}
