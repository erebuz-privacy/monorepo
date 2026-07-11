// Contract ABIs
// Comprehensive ABI definitions for all contracts used in the system

import { parseAbi } from 'viem/utils';

/**
 * Nexus Account Factory ABI
 * Factory contract for creating and computing addresses of Nexus accounts
 */
export const NEXUS_ACCOUNT_FACTORY_ABI = [
  {
    inputs: [
      { name: 'initData', type: 'bytes' },
      { name: 'salt', type: 'bytes32' },
    ],
    name: 'computeAccountAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'initData', type: 'bytes' },
      { name: 'salt', type: 'bytes32' },
    ],
    name: 'createAccount',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

/**
 * Nexus Bootstrap ABI
 * Bootstrap contract for initializing Nexus accounts with validators, executors, and other modules
 */
export const NEXUS_BOOTSTRAP_ABI: any = [
  {
    inputs: [
      { name: 'defaultValidatorInitData', type: 'bytes' },
      {
        name: 'validators',
        type: 'tuple[]',
        components: [
          { name: 'module', type: 'address' },
          { name: 'data', type: 'bytes' },
        ],
      },
      {
        name: 'executors',
        type: 'tuple[]',
        components: [
          { name: 'module', type: 'address' },
          { name: 'data', type: 'bytes' },
        ],
      },
      {
        name: 'hook',
        type: 'tuple',
        components: [
          { name: 'module', type: 'address' },
          { name: 'data', type: 'bytes' },
        ],
      },
      {
        name: 'fallbacks',
        type: 'tuple[]',
        components: [
          { name: 'module', type: 'address' },
          { name: 'data', type: 'bytes' },
        ],
      },
      {
        name: 'preValidationHooks',
        type: 'tuple[]',
        components: [
          { name: 'hookType', type: 'uint256' },
          { name: 'module', type: 'address' },
          { name: 'data', type: 'bytes' },
        ],
      },
      {
        name: 'registryConfig',
        type: 'tuple',
        components: [
          { name: 'registry', type: 'address' },
          { name: 'attesters', type: 'address[]' },
          { name: 'threshold', type: 'uint8' },
        ],
      },
    ],
    name: 'initNexusWithDefaultValidatorAndOtherModules',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

/**
 * Biconomy Meta Factory ABI
 * Meta factory contract for deploying contracts with a specific factory
 */
export const BICONOMY_META_FACTORY_ABI = [
  {
    inputs: [
      { name: 'factory', type: 'address' },
      { name: 'initData', type: 'bytes' },
    ],
    name: 'deployWithFactory',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * ERC20 Token ABI
 * Standard ERC20 token interface with balanceOf, transfer, and decimals functions
 */
export const ERC20_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    name: 'transferWithAuthorization',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Auto Earn Module ABI
 * Module for automatically depositing tokens to yield farming protocols like Aave
 */
export const AUTO_EARN_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'nexusAccount', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'autoEarn',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'isInitialized',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'newConfigs',
        type: 'tuple[]',
        components: [
          { name: 'sourceChainId', type: 'uint256' },
          { name: 'sourceTokenAddress', type: 'address' },
          { name: 'vaultAddress', type: 'address' },
        ],
      },
    ],
    name: 'setConfig',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Auto Bridge Module ABI
 * Module for cross-chain token bridging using protocols like Across
 */
export const AUTO_BRIDGE_ABI = [
  {
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'relayerFeePct', type: 'uint256' },
      { name: 'nexusAccount', type: 'address' },
      { name: 'recievingNexusAccount', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'bridge',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'isInitialized',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'sourceChainId', type: 'uint256' },
          { name: 'sourceTokenAddress', type: 'address' },
          { name: 'destinationChainId', type: 'uint256' },
        ],
        name: 'newConfigs',
        type: 'tuple[]',
      },
    ],
    name: 'setConfig',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getConfig',
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'destinationChainId', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'configHash_', type: 'uint256' },
      { name: 'chainId_', type: 'uint256' },
    ],
    name: 'getConfigForChain',
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'destinationChainId', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Auto Swap Module ABI
 * Module for automatically swapping tokens using DEX protocols like Uniswap
 */
export const AUTO_SWAP_ABI = [
  {
    inputs: [
      { name: 'inputToken', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'nexusAccount', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'swap',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'isInitialized',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Multicall3 ABI
 * Standard multicall contract for batching multiple contract calls
 */
export const MULTICALL3_ABI = [
  {
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    name: 'aggregate3',
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

/**
 * Uniswap V3 Quoter ABI
 * Interface for getting quotes from Uniswap V3
 */
export const UNISWAP_QUOTER_ABI = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'quoteExactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'path', type: 'bytes' },
      { name: 'amountIn', type: 'uint256' },
    ],
    name: 'quoteExactInput',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Nexus Account ABI
 * ABI for Nexus account contract operations
 */
export const NEXUS_ACCOUNT_ABI = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'mode', type: 'bytes32' },
      { name: 'executionCalldata', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getNonce',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Aave Pool ABI
 * ABI for Aave V3 pool operations
 */
export const AAVE_POOL_ABI = [
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * EntryPoint ABI (ERC-4337)
 * EntryPoint contract for ERC-4337 account abstraction
 */
export const ENTRYPOINT_ABI = [
  {
    type: 'function',
    name: 'getNonce',
    stateMutability: 'view',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'key', type: 'uint192' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getUserOpHash',
    stateMutability: 'view',
    inputs: [
      {
        name: 'userOp',
        type: 'tuple',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'accountGasLimits', type: 'bytes32' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'gasFees', type: 'bytes32' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'handleOps',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'ops',
        type: 'tuple[]',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'accountGasLimits', type: 'bytes32' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'gasFees', type: 'bytes32' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
      { name: 'beneficiary', type: 'address' },
    ],
    outputs: [],
  },
] as const;

/**
 * K1 Validator ABI
 * Validator contract for ECDSA signature validation
 */
export const K1_VALIDATOR_ABI = [
  {
    type: 'function',
    name: 'isInitialized',
    stateMutability: 'view',
    inputs: [{ name: 'smartAccount', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getOwner',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

/**
 * Verifying Paymaster ABI
 * Paymaster contract for sponsoring gas fees with signature verification
 */
export const VERIFYING_PAYMASTER_ABI = [
  {
    type: 'function',
    name: 'getHash',
    stateMutability: 'view',
    inputs: [
      {
        name: 'userOp',
        type: 'tuple',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'accountGasLimits', type: 'bytes32' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'gasFees', type: 'bytes32' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
      { name: 'validUntil', type: 'uint48' },
      { name: 'validAfter', type: 'uint48' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'verifyingSigner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

/**
 * ABI for `OffchainResolver.sol`
 * @see https://github.com/ensdomains/offchain-resolver/blob/efb7c02eb8f8fc02a222cd055f9c055919b7a5ae/packages/contracts/contracts/OffchainResolver.sol#L41-L51
 */
export const OFFCHAIN_RESOLVER_ABI = parseAbi([
  'function resolve(bytes calldata name, bytes calldata data) view returns(bytes memory result, uint64 expires, bytes memory sig)',
]);

/**
 * ABI for the ENS resolver specification
 * @see https://docs.ens.domains/resolvers/interfaces
 */
export const RESOLVER_ABI = parseAbi([
  'function addr(bytes32 node) view returns (address)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes memory)',
  'function text(bytes32 node, string key) view returns (string memory)',
  'function contenthash(bytes32 node) view returns (bytes memory)',
]);
