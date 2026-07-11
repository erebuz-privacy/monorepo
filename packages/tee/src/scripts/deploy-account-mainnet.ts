#!/usr/bin/env npx tsx
/**
 * Deploy smart account on all mainnet chains using MEE v2.1.0
 */

import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  http,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  toBytes,
  getAddress,
  bytesToHex,
  formatEther,
  zeroAddress,
} from 'viem';
import { base, polygon, arbitrum, optimism } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { readFile } from 'fs/promises';
import { join } from 'path';
import 'dotenv/config';
import {
  nexusFactoryAbi,
  bootstrapInitNexusAbi,
} from './abis';
import { EIP712Signer, createInstallConfigData, encodeInstallData } from '../services/eip712-signer';

// Mainnet contract addresses (same across all chains)
const bootstrapperAddress = "0x0000003eDf18913c01cBc482C978bBD3D6E8ffA3" as const;
const nexusAccountFactoryAddress = "0x0000006648ED9B2B842552BE63Af870bC74af837" as const;


interface ChainConfig {
  id: number;
  name: string;
  contracts: Array<{ name: string; address: string }>;
  modules: Array<{ name: string; address: string }>;
  tokens?: Array<{ symbol: string; address: string }>;
}

const CHAINS = [
  { name: 'Base', chain: base, file: 'base.json' },
  { name: 'Polygon', chain: polygon, file: 'polygon.json' },
  { name: 'Arbitrum', chain: arbitrum, file: 'arbitrum.json' },
  { name: 'Optimism', chain: optimism, file: 'optimism.json' },
];

async function loadChainConfig(file: string): Promise<ChainConfig> {
  const configPath = join(process.cwd(), 'src/config/web3/chains', file);
  const content = await readFile(configPath, 'utf-8');
  return JSON.parse(content);
}

function getContract(config: ChainConfig, name: string): string | undefined {
  return config.contracts.find((c) => c.name === name)?.address;
}

function getModule(config: ChainConfig, name: string): string | undefined {
  return config.modules.find((m) => m.name === name)?.address;
}

async function main() {
  console.log('='.repeat(70));
  console.log('Deploy Smart Account on All Mainnet Chains (MEE v2.1.0)');
  console.log('='.repeat(70));

  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY environment variable not set');
    process.exit(1);
  }

  // Create account from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`\nDeployer wallet: ${account.address}`);

  // Use deployer as the owner of the smart account
  const ownerAddress = account.address;
  const salt = keccak256(toBytes(ownerAddress));
  console.log(`Owner address: ${ownerAddress}`);
  console.log(`Salt: ${salt}`);

  const results: Array<{ chain: string; success: boolean; address?: string; txHash?: string; error?: string }> = [];

  for (const chainInfo of CHAINS) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Chain: ${chainInfo.name}`);
    console.log(`${'─'.repeat(70)}`);

    try {
      // Load config (only for module addresses which are chain-specific)
      const config = await loadChainConfig(chainInfo.file);

      // Get module address (chain-specific)
      const moduleAddress = getModule(config, 'nearIntentBridgeModule');

      if (!moduleAddress) {
        console.log('❌ Missing module address in config');
        results.push({ chain: chainInfo.name, success: false, error: 'Missing module address' });
        continue;
      }

      // Use mainnet addresses for bootstrap and factory (same across all chains)
      const nexusAccountFactory = nexusAccountFactoryAddress;
      const nexusBootstrap = bootstrapperAddress;

      // Create clients
      const publicClient = createPublicClient({
        transport: http(),
        chain: chainInfo.chain,
      });

      const walletClient = createWalletClient({
        transport: http(),
        chain: chainInfo.chain,
        account,
      });

      // Check deployer balance
      const balance = await publicClient.getBalance({ address: account.address });
      console.log(`Deployer balance: ${formatEther(balance)} ETH`);

      if (balance === 0n) {
        console.log('❌ No balance to pay for gas');
        results.push({ chain: chainInfo.name, success: false, error: 'No balance' });
        continue;
      }

      // Build init data - use iterative approach to get correct predicted address
      const defaultValidatorInitData = bytesToHex(toBytes(getAddress(ownerAddress)));
      const validators: Array<{ module: Address; data: Hex }> = [];
      const hook = { module: zeroAddress, data: '0x' as Hex };
      const fallbacks: Array<{ module: Address; data: Hex }> = [];
      const preValidationHooks: Array<{ hookType: bigint; module: Address; data: Hex }> = [];

      // Get TEE signer (using PRIVATE_KEY from env - should be TEE's private key)
      const teeSigner = new EIP712Signer(privateKey as Hex);
      const teeSignerAddress = teeSigner.getAddress();
      console.log(`TEE Signer address: ${teeSignerAddress}`);

      // Verify TEE signer matches module configuration (if available)
      const moduleConfig = config.modules.find((m) => m.name === 'nearIntentBridgeModule');
      if (moduleConfig && (moduleConfig as any).configuration?.teeSigner) {
        const expectedTeeSigner = (moduleConfig as any).configuration.teeSigner.toLowerCase();
        if (teeSignerAddress.toLowerCase() !== expectedTeeSigner) {
          console.warn(`⚠️  TEE signer mismatch! Expected: ${expectedTeeSigner}, Got: ${teeSignerAddress}`);
          console.warn(`   Make sure PRIVATE_KEY corresponds to the TEE signer configured in AutoShield`);
        } else {
          console.log(`✅ TEE signer matches module configuration`);
        }
      }

      // Create InstallConfig data
      // Default: allow USDC with 10,000 max amount, valid for 1 year
      const tokens: Address[] = [];
      const maxAmounts: bigint[] = [];
      
      // Try to get USDC from config if available
      const usdcAddress = config.tokens?.find((t) => t.symbol === 'USDC')?.address;
      if (usdcAddress) {
        tokens.push(usdcAddress as Address);
        maxAmounts.push(10000n * 10n ** 6n); // 10,000 USDC (6 decimals)
      }

      // If no tokens configured, use empty arrays (module will be installed but no tokens allowed)
      const validityDuration = 365 * 24 * 60 * 60; // 1 year
      const installNonce = 0n; // First install, nonce is 0

      // Compute initial predicted address with empty executor data
      const tempInitNexusData = encodeFunctionData({
        abi: bootstrapInitNexusAbi,
        functionName: 'initNexusWithDefaultValidatorAndOtherModulesNoRegistry',
        args: [
          defaultValidatorInitData,
          validators,
          [{ module: moduleAddress as Address, data: '0x' as Hex }],
          hook,
          fallbacks,
          preValidationHooks,
        ],
      });

      const tempInitData = encodeAbiParameters(
        [{ type: 'address' }, { type: 'bytes' }],
        [nexusBootstrap, tempInitNexusData]
      );

      // Compute predicted address (with empty executor data)
      const predictedAddress = await publicClient.readContract({
        address: nexusAccountFactory,
        abi: nexusFactoryAbi,
        functionName: 'computeAccountAddress',
        args: [tempInitData, salt],
      }) as Address;

      console.log(`Predicted smart account: ${predictedAddress}`);

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create and sign InstallConfig
      // Note: account is no longer part of the signature, so we can sign independently
      // The nonce provides replay protection per account
      const installConfigData = createInstallConfigData(
        tokens,
        maxAmounts,
        validityDuration,
        installNonce
      );

      const signedConfig = await teeSigner.signInstallConfig(
        chainInfo.chain.id,
        moduleAddress as Address,
        installConfigData
      );

      // Encode executor data
      const executorData = encodeInstallData(signedConfig);
      console.log(`Executor data length: ${executorData.length} bytes`);

      // Rebuild init data with signed executor data
      const executors = [{ module: moduleAddress as Address, data: executorData }];
      const initNexusData = encodeFunctionData({
        abi: bootstrapInitNexusAbi,
        functionName: 'initNexusWithDefaultValidatorAndOtherModulesNoRegistry',
        args: [defaultValidatorInitData, validators, executors, hook, fallbacks, preValidationHooks],
      });

      const initData = encodeAbiParameters(
        [{ type: 'address' }, { type: 'bytes' }],
        [nexusBootstrap, initNexusData]
      );

      // Compute final expected address
      await new Promise((resolve) => setTimeout(resolve, 500)); // Rate limit protection
      const expectedAddress = await publicClient.readContract({
        address: nexusAccountFactory,
        abi: nexusFactoryAbi,
        functionName: 'computeAccountAddress',
        args: [initData, salt],
      }) as Address;

      console.log(`Final computed address: ${expectedAddress}`);

      // Note: The addresses may differ slightly due to the circular dependency,
      // but we'll use the final computed address for deployment
      const finalAddress = expectedAddress;

      // Check if already deployed
      const existingCode = await publicClient.getCode({ address: expectedAddress as Address });
      if (existingCode && existingCode !== '0x') {
        console.log('✅ Account already deployed!');
        results.push({ chain: chainInfo.name, success: true, address: expectedAddress as string });
        continue;
      }

      // Get gas price
      const gasPrice = await publicClient.getGasPrice();
      console.log(`Gas price: ${formatEther(gasPrice * 1000000n)} gwei`);

      // Deploy directly via NexusAccountFactory (same as reference script)
      console.log('Deploying account via NexusAccountFactory...');

      const txHash = await walletClient.writeContract({
        address: nexusAccountFactory,
        abi: nexusFactoryAbi,
        functionName: 'createAccount',
        args: [initData, salt],
        gas: 2000000n,
      });

      console.log(`Transaction sent: ${txHash}`);

      // Wait for confirmation
      console.log('Waiting for confirmation...');
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 120000,
      });

      if (receipt.status === 'success') {
        console.log(`✅ Account deployed successfully!`);
        console.log(`   Address: ${expectedAddress}`);
        console.log(`   Tx Hash: ${txHash}`);
        console.log(`   Gas Used: ${receipt.gasUsed}`);
        console.log(`   Block: ${receipt.blockNumber}`);
        results.push({ chain: chainInfo.name, success: true, address: expectedAddress as string, txHash });
      } else {
        console.log(`❌ Transaction failed`);
        results.push({ chain: chainInfo.name, success: false, error: 'Transaction reverted', txHash });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ Error: ${errorMessage}`);
      results.push({ chain: chainInfo.name, success: false, error: errorMessage });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('Deployment Summary');
  console.log('='.repeat(70));

  for (const result of results) {
    if (result.success) {
      console.log(`✅ ${result.chain}: ${result.address}`);
      if (result.txHash) {
        console.log(`   Tx: ${result.txHash}`);
      }
    } else {
      console.log(`❌ ${result.chain}: ${result.error}`);
    }
  }

  const successful = results.filter((r) => r.success).length;
  console.log(`\nTotal: ${successful}/${results.length} chains deployed`);
}

main().catch(console.error);
