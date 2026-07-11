// Deposit Monitor Service
// Monitors smart accounts for incoming token deposits and triggers NEAR Intent swaps
// Uses stored smart account addresses from database

import { type Address, type Hex, formatUnits } from 'viem';
import { chainManager } from '../../managers/chain';
import { logger } from '../../managers/log';
import { StealthUserModel, type StealthUser } from '../../database/models/stealth-user';
import { StealthAddressModel } from '../../database/models/stealth-address';
import { getQuote, submitDeposit, SUPPORTED_TOKENS } from '../near-intents';
import { NEAR_INTENT_BRIDGE_MODULE } from '../../config/global-config';
import { ERC20_ABI } from '../../config/web3/abis';
import { getEIP712Signer, createExecuteTransferData } from '../eip712-signer';

// Mainnet chain IDs to monitor
const MONITORED_CHAINS = [8453, 137, 42161, 10]; // Base, Polygon, Arbitrum, Optimism

// Minimum amount to trigger a swap (in human-readable units)
// Will be converted to token decimals on-chain
const MIN_AMOUNTS_HUMAN: Record<string, number> = {
  USDC: 0.1, // 0.1 USDC
  USDT: 0.1, // 0.1 USDT
  WETH: 0.0001, // 0.0001 WETH
};

// Signature validity duration (100 hours)
const SIGNATURE_VALIDITY_SECONDS = 3600000;

// NearIntentBridgeModule ABI for EIP-712 based execute function
const NEAR_INTENT_BRIDGE_MODULE_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'account', type: 'address' },
      { name: 'expiry', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'executeNonces',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'installNonces',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
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
      { name: 'account', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    name: 'getTokenAllowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

interface PendingDeposit {
  user: StealthUser;
  chainId: number;
  smartAccountAddress: Address;
  stealthAddress: Address;
  tokenSymbol: string;
  tokenAddress: Address;
  balance: bigint;
  stealthAddressRecordId: string; // For tracking which record this deposit belongs to
}

/**
 * Get the TEE signer wallet
 */
function getTEESigner(chainId: number) {
  const chain = chainManager.getChain(chainId);
  if (!chain) {
    throw new Error(`Chain ${chainId} not supported`);
  }
  return chain.getWallet();
}

/**
 * Get token decimals on-chain
 */
async function getTokenDecimals(
  chainId: number,
  tokenAddress: Address
): Promise<number> {
  const chain = chainManager.getChain(chainId);
  if (!chain) return 18; // Default to 18 if chain not found

  const publicClient = chain.getPublicClient();

  try {
    const decimals = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'decimals',
      args: [],
    });
    return Number(decimals);
  } catch (error) {
    logger.error(`Failed to get token decimals`, 'DepositMonitor', { chainId, tokenAddress, error });
    return 18; // Default to 18 decimals on error
  }
}

/**
 * Check token balance for a smart account
 */
async function getTokenBalance(
  chainId: number,
  accountAddress: Address,
  tokenAddress: Address
): Promise<bigint> {
  const chain = chainManager.getChain(chainId);
  if (!chain) return 0n;

  const publicClient = chain.getPublicClient();

  try {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [accountAddress],
    });
    return balance as bigint;
  } catch (error) {
    logger.error(`Failed to get token balance`, 'DepositMonitor', { chainId, accountAddress, tokenAddress, error });
    return 0n;
  }
}

/**
 * Check if a smart account is deployed
 */
async function isAccountDeployed(chainId: number, accountAddress: Address): Promise<boolean> {
  const chain = chainManager.getChain(chainId);
  if (!chain) return false;

  const publicClient = chain.getPublicClient();
  const code = await publicClient.getCode({ address: accountAddress });
  return code !== undefined && code !== '0x';
}

/**
 * Deploy a smart account using stored initData
 * 
 * Important: The initData must match what was computed during ENS resolution:
 * - Uses stealth address as owner
 * - Uses stealth address (bytes20 -> uint256) as InstallConfig nonce
 * - Uses keccak256(stealthAddress) as salt
 * 
 * This ensures the deployed account matches the computed address.
 * 
 * Note: Accounts should ideally be deployed when computed, but this serves as a fallback
 */
async function deploySmartAccount(
  chainId: number,
  smartAccountAddress: Address,
  initData: Hex,
  salt: Hex
): Promise<{ success: boolean; txHash?: Hex; error?: string }> {
  try {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return { success: false, error: `Chain ${chainId} not supported` };
    }

    const publicClient = chain.getPublicClient();
    const walletClient = chain.getWallet();

    if (!walletClient.account) {
      return { success: false, error: 'Wallet client has no account' };
    }

    // Get contracts
    const nexusAccountFactory = chain.getNexusAccountFactory();
    if (!nexusAccountFactory) {
      return { success: false, error: 'NexusAccountFactory not found' };
    }

    // Deploy directly via NexusAccountFactory
    const txHash = await walletClient.writeContract({
      address: nexusAccountFactory.address as Address,
      abi: [
        {
          inputs: [
            { name: 'initData', type: 'bytes' },
            { name: 'salt', type: 'bytes32' },
          ],
          name: 'createAccount',
          outputs: [{ name: 'account', type: 'address' }],
          stateMutability: 'payable',
          type: 'function',
        },
      ],
      functionName: 'createAccount',
      args: [initData, salt],
      account: walletClient.account,
      chain: chain.getViemChain(),
    });

    logger.info(`Smart account deployment tx sent: ${txHash}`, 'DepositMonitor', { chainId, smartAccountAddress });

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return { success: true, txHash };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to deploy smart account`, 'DepositMonitor', error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Execute the NearIntentBridgeModule to transfer tokens to NEAR Intent deposit address
 * Uses EIP-712 typed data signing
 */
async function executeModule(
  chainId: number,
  smartAccountAddress: Address,
  tokenAddress: Address,
  amount: bigint,
  depositAddress: Address
): Promise<{ success: boolean; txHash?: Hex; error?: string }> {
  try {
    const chain = chainManager.getChain(chainId);
    if (!chain) {
      return { success: false, error: `Chain ${chainId} not supported` };
    }

    const publicClient = chain.getPublicClient();
    const walletClient = chain.getWallet();

    if (!walletClient.account) {
      return { success: false, error: 'Wallet client has no account' };
    }

    const moduleAddress = NEAR_INTENT_BRIDGE_MODULE[chainId];
    if (!moduleAddress) {
      return { success: false, error: `Module not configured for chain ${chainId}` };
    }

    // Get current execute nonce from module
    const nonce = await publicClient.readContract({
      address: moduleAddress,
      abi: NEAR_INTENT_BRIDGE_MODULE_ABI,
      functionName: 'executeNonces',
      args: [smartAccountAddress],
    });

    // Create EIP-712 typed data and sign
    const signer = getEIP712Signer();
    const transferData = createExecuteTransferData(
      smartAccountAddress,
      tokenAddress,
      amount,
      depositAddress,
      SIGNATURE_VALIDITY_SECONDS,
      nonce as bigint
    );

    const signedTransfer = await signer.signExecuteTransfer(
      chainId,
      moduleAddress,
      transferData
    );

    // Call execute on the module with EIP-712 signature
    // Signature matches: execute(address token, uint256 amount, address to, address account, uint256 expiry, bytes calldata signature)
    const txHash = await walletClient.writeContract({
      address: moduleAddress,
      abi: NEAR_INTENT_BRIDGE_MODULE_ABI,
      functionName: 'execute',
      args: [
        tokenAddress,        // token
        amount,              // amount
        depositAddress,       // to (NEAR Intent deposit address)
        smartAccountAddress,  // account (smart account to transfer from)
        signedTransfer.expiry, // expiry
        signedTransfer.signature, // signature
      ],
      account: walletClient.account,
      chain: chain.getViemChain(),
    });

    logger.info(`Module execute tx sent: ${txHash}`, 'DepositMonitor', {
      chainId,
      smartAccountAddress,
      amount: amount.toString(),
      depositAddress,
    });

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return { success: true, txHash };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to execute module`, 'DepositMonitor', error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Process a pending deposit - deploy account if needed, get NEAR Intent quote, execute transfer
 */
async function processPendingDeposit(deposit: PendingDeposit): Promise<boolean> {
  const { user, chainId, smartAccountAddress, stealthAddress, tokenSymbol, tokenAddress, balance } = deposit;

  logger.info(`Processing deposit for ${user.ensUsername}`, 'DepositMonitor', {
    chainId,
    smartAccountAddress,
    tokenSymbol,
    balance: balance.toString(),
  });

  // Check if user has Zcash address
  if (!user.zcashAddress) {
    logger.warn(`User ${user.ensUsername} has no Zcash address configured`, 'DepositMonitor');
    return false;
  }

  // 1. Check if account is deployed, deploy if needed using stored initData
  // Note: The stored initData was computed during ENS resolution using:
  // - Stealth address as owner
  // - Stealth address (bytes20 -> uint256) as InstallConfig nonce
  // - Same salt: keccak256(stealthAddress)
  // This ensures consistency - same stealth address = same smart account address
  const deployed = await isAccountDeployed(chainId, smartAccountAddress);
  if (!deployed) {
    logger.info(`Account not deployed, attempting to deploy`, 'DepositMonitor', { chainId, smartAccountAddress });
    
    // Get the stealth address record to retrieve initData
    // This initData already contains InstallConfig with stealth address as nonce
    const stealthAddrRecord = await StealthAddressModel.findBySmartAccountAddress(smartAccountAddress);
    if (!stealthAddrRecord || !stealthAddrRecord.initData) {
      logger.error(`Cannot deploy account: initData not found in database`, 'DepositMonitor');
      return false;
    }

    // Compute salt from stealth address (matching computeSmartAccountForENS)
    // Must match the salt used during ENS resolution to get the same address
    const { keccak256, toBytes, getAddress } = await import('viem');
    const salt = keccak256(toBytes(getAddress(stealthAddress as Address)));

    const deployResult = await deploySmartAccount(
      chainId,
      smartAccountAddress,
      stealthAddrRecord.initData as Hex,
      salt
    );
    
    if (!deployResult.success) {
      logger.error(`Failed to deploy account: ${deployResult.error}`, 'DepositMonitor');
      return false;
    }
    logger.info(`Smart account deployed: ${deployResult.txHash}`, 'DepositMonitor');
  }

  // 2. Get token decimals on-chain
  const decimals = await getTokenDecimals(chainId, tokenAddress);
  
  // 3. Get NEAR Intent quote
  const tokenInfo = SUPPORTED_TOKENS[chainId]?.[tokenSymbol];
  if (!tokenInfo) {
    logger.error(`Token ${tokenSymbol} not supported on chain ${chainId}`, 'DepositMonitor');
    return false;
  }

  const quote = await getQuote(
    chainId,
    tokenSymbol,
    balance.toString(),
    user.zcashAddress,
    smartAccountAddress // Refund goes back to smart account
  );

  if (!quote) {
    logger.error(`Failed to get NEAR Intent quote`, 'DepositMonitor');
    return false;
  }

  logger.info(`Got quote from NEAR Intents`, 'DepositMonitor', {
    depositAddress: quote.depositAddress,
    amountOut: quote.amountOut,
  });

  // 4. Execute module to transfer tokens to NEAR Intent deposit address
  const executeResult = await executeModule(
    chainId,
    smartAccountAddress,
    tokenAddress,
    balance,
    quote.depositAddress as Address
  );

  if (!executeResult.success) {
    logger.error(`Failed to execute module: ${executeResult.error}`, 'DepositMonitor');
    return false;
  }

  // 5. Submit the deposit tx to NEAR Intents for faster processing
  if (executeResult.txHash) {
    await submitDeposit(quote.depositAddress, executeResult.txHash);
  }

  logger.info(`Deposit processed successfully`, 'DepositMonitor', {
    user: user.ensUsername,
    chainId,
    amount: formatUnits(balance, decimals),
    tokenSymbol,
    decimals,
    zcashAddress: user.zcashAddress,
    expectedZEC: quote.amountOut,
  });

  return true;
}

/**
 * Scan all users for pending deposits
 * Uses stored smart account addresses from database
 */
export async function scanForDeposits(): Promise<void> {
  logger.info(`Starting deposit scan`, 'DepositMonitor');

  try {
    // Get all active users with Zcash addresses
    const users = await StealthUserModel.findAllActive();
    const usersWithZcash = users.filter((u) => u.zcashAddress);

    logger.info(`Found ${usersWithZcash.length} users with Zcash addresses`, 'DepositMonitor');

    const pendingDeposits: PendingDeposit[] = [];

    // For each user, get their stored smart account addresses and check balances
    for (const user of usersWithZcash) {
      if (!user.zcashAddress) {
        continue;
      }

      // For each monitored chain
      for (const chainId of MONITORED_CHAINS) {
        try {
          // Get all stealth addresses for this user and chain that have smart account addresses
          const stealthAddresses = await StealthAddressModel.findByUserIdAndChain(user.id, chainId);
          
          // Filter to only those with smart account addresses (computed accounts)
          const accountsWithSmartAccounts = stealthAddresses.filter(
            (addr) => addr.smartAccountAddress && addr.smartAccountAddress !== null
          );

          logger.debug(`Found ${accountsWithSmartAccounts.length} smart accounts for user ${user.ensUsername} on chain ${chainId}`, 'DepositMonitor');

          // Check token balances for each smart account
          const tokens = SUPPORTED_TOKENS[chainId];
          if (!tokens) continue;

          for (const stealthAddrRecord of accountsWithSmartAccounts) {
            const smartAccountAddress = stealthAddrRecord.smartAccountAddress! as Address;
            const stealthAddress = stealthAddrRecord.stealthAddress as Address;

            // Check balances for all supported tokens (USDC, USDT, WETH)
            for (const [tokenSymbol, tokenInfo] of Object.entries(tokens)) {
              const tokenAddress = tokenInfo.address as Address;
              const balance = await getTokenBalance(chainId, smartAccountAddress, tokenAddress);
              
              // Get decimals on-chain
              const decimals = await getTokenDecimals(chainId, tokenAddress);
              
              // Convert minimum amount from human-readable to token units
              const minAmountHuman = MIN_AMOUNTS_HUMAN[tokenSymbol] || 0;
              const minAmount = BigInt(Math.floor(minAmountHuman * 10 ** decimals));

              if (balance > minAmount) {
                pendingDeposits.push({
                  user,
                  chainId,
                  smartAccountAddress,
                  stealthAddress,
                  tokenSymbol,
                  tokenAddress,
                  balance,
                  stealthAddressRecordId: stealthAddrRecord.id,
                });

                logger.info(`Found pending deposit`, 'DepositMonitor', {
                  user: user.ensUsername,
                  chainId,
                  tokenSymbol,
                  balance: formatUnits(balance, decimals),
                  decimals,
                  smartAccountAddress,
                });
              }
            }
          }
        } catch (error) {
          logger.error(`Error scanning user ${user.ensUsername} on chain ${chainId}`, 'DepositMonitor', error);
        }
      }
    }

    // Process all pending deposits
    for (const deposit of pendingDeposits) {
      try {
        await processPendingDeposit(deposit);
      } catch (error) {
        logger.error(`Error processing deposit`, 'DepositMonitor', error);
      }
    }

    logger.info(`Deposit scan complete. Found ${pendingDeposits.length} deposits`, 'DepositMonitor');
  } catch (error) {
    logger.error(`Deposit scan failed`, 'DepositMonitor', error);
  }
}

/**
 * Start the deposit monitor (runs periodically)
 */
export function startDepositMonitor(intervalMs = 5000): NodeJS.Timeout {
  logger.info(`Starting deposit monitor with ${intervalMs}ms interval`, 'DepositMonitor');

  // Run immediately
  scanForDeposits().catch((err) => logger.error('Initial scan failed', 'DepositMonitor', err));

  // Then run periodically
  return setInterval(() => {
    scanForDeposits().catch((err) => logger.error('Periodic scan failed', 'DepositMonitor', err));
  }, intervalMs);
}

/**
 * Stop the deposit monitor
 */
export function stopDepositMonitor(timerId: NodeJS.Timeout): void {
  clearInterval(timerId);
  logger.info(`Deposit monitor stopped`, 'DepositMonitor');
}
