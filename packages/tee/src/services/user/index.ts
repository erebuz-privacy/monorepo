// User Service

import { EnsUsernameModel, type EnsUsername } from '../../database/models/ens-username';
import { StealthUserModel, type StealthUser } from '../../database/models/stealth-user';
import { StealthAddressModel } from '../../database/models/stealth-address';
import type { PaginationOptions, PaginatedResult, RegisterRequest, RegisterResponse } from '../../types';
import { logger } from '../../managers/log';
import { verifyMessage, zeroAddress, type Address, type Hex } from 'viem';
import { DEFAULT_CHAIN_ID, STEALTH_ADDRESS_GENERATION_MESSAGE, ENS_DOMAIN, buildRegistrationMessage } from '../../config/global-config';
import { chainManager } from '../../managers/chain';
import { computeStealthAddresses, StealthGenerationError } from '../../utils/stealth-address';
import { computeSmartAccountForENS } from '../../utils/smart-account';
import { StealthError, StealthValidationError } from '../../utils/errors';

// Resolver query type for ENS resolution
export interface ResolverQuery {
  functionName: 'addr' | 'text' | 'contenthash';
  args: readonly unknown[];
}

export class UserService {
  /**
   * Query ENS username by username
   * @param name - The ENS username to query
   * @returns The ENS username record or null if not found
   */
  static async getEnsUsername(name: string): Promise<EnsUsername | null> {
    try {
      logger.info(`Querying ENS username: ${name}`, 'UserService');
      const result = await EnsUsernameModel.findByName(name);
      
      if (result) {
        logger.info(`Found ENS username: ${name}`, 'UserService');
      } else {
        logger.info(`ENS username not found: ${name}`, 'UserService');
      }
      
      return result;
    } catch (error) {
      logger.error(`Error querying ENS username: ${name}`, 'UserService', error);
      throw error;
    }
  }

  /**
   * List all users with pagination support
   * @param options - Pagination options (page, pageSize)
   * @returns Paginated result of ENS usernames
   */
  static async listUsers(options: PaginationOptions = { page: 1, pageSize: 10 }): Promise<PaginatedResult<EnsUsername>> {
    try {
      logger.info(`Listing users with pagination: page=${options.page}, pageSize=${options.pageSize}`, 'UserService');
      const result = await EnsUsernameModel.findAll(options);
      logger.info(`Found ${result.total} total users, returning ${result.data.length} users`, 'UserService');
      return result;
    } catch (error) {
      logger.error('Error listing users', 'UserService', error);
      throw error;
    }
  }

  /**
   * Get active nonce for a user after verifying signature
   * @param eoaAddress - The EOA address of the user
   * @param signature - The signature to verify
   * @param defaultChainId - Default chain ID (defaults to DEFAULT_CHAIN_ID from config)
   * @returns User data with chain nonces or null if not found/invalid
   */
  static async getActiveNonce(
    eoaAddress: string,
    signature: string,
    defaultChainId: number = DEFAULT_CHAIN_ID
  ): Promise<{ success: true; data: StealthUser & { chainNonces: Record<string, number> } } | { success: false; error: string }> {
    try {
      logger.info(`Getting active nonce for user: ${eoaAddress}`, 'UserService');

      // Verify the signature
      logger.info(`Verifying signature for message: ${STEALTH_ADDRESS_GENERATION_MESSAGE}`, 'UserService');

      const isValidSignature = await verifyMessage({
        address: eoaAddress as Address,
        message: STEALTH_ADDRESS_GENERATION_MESSAGE,
        signature: signature as `0x${string}`,
      });

      if (!isValidSignature) {
        logger.warn(`Invalid signature for address: ${eoaAddress}`, 'UserService');
        return {
          success: false,
          error: 'Invalid signature',
        };
      }

      logger.info(`Signature verified successfully for address: ${eoaAddress}`, 'UserService');

      // Get user stealth data (normalize address to lowercase for lookup)
      const stealthUser = await StealthUserModel.findByEoaAddress(eoaAddress.toLowerCase());

      if (!stealthUser) {
        logger.warn(`User not found for address: ${eoaAddress}`, 'UserService');
        return {
          success: false,
          error: 'User not found',
        };
      }

      logger.info(`User found, preparing response for address: ${eoaAddress}`, 'UserService');

      // For privacy-off users, ensure default chain nonce is present and 0 in the response
      const chainNonces = stealthUser.chainNonces as Record<string, number> || {};
      const responseChainNonces = { ...chainNonces };

      if (!stealthUser.privacyEnabled) {
        const defaultChainIdStr = defaultChainId.toString();
        if (responseChainNonces[defaultChainIdStr] === undefined) {
          responseChainNonces[defaultChainIdStr] = 0;
        }
      }

      return {
        success: true,
        data: {
          ...stealthUser,
          chainNonces: responseChainNonces,
        },
      };
    } catch (error) {
      logger.error(`Error getting active nonce for address: ${eoaAddress}`, 'UserService', error);
      throw error;
    }
  }

  /**
   * Register a new stealth user
   * @param request - Registration request data
   * @returns Registration response with success status, ENS username, and API key
   */
  static async registerUser(request: RegisterRequest): Promise<RegisterResponse> {
    try {
      logger.info('Starting user registration', 'UserService');
      logger.info(`ENS Username: ${request.ensData.ensUsername}`, 'UserService');
      logger.info(`EOA Address: ${request.ensData.eoaAddress}`, 'UserService');
      logger.info('Privacy Enabled: true (always enabled)', 'UserService');

      // Validate input
      UserService.validateRegisterRequest(request);

      logger.info('Validated register request', 'UserService');

      // SECURITY: Verify the request was actually signed by the claimed EOA.
      // Without this, anyone could register an ENS name bound to an address they
      // do not control, with attacker-chosen stealth/zcash keys, and hijack the
      // ENS resolution + stealth-address derivation for that name.
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (request.signature.expiration < nowSeconds) {
        logger.warn(`Expired registration signature for ${request.ensData.eoaAddress}`, 'UserService');
        throw new Error('Signature expired');
      }

      const signedMessage = buildRegistrationMessage({
        ensUsername: request.ensData.ensUsername,
        eoaAddress: request.ensData.eoaAddress,
        expiration: request.signature.expiration,
        spendingPublicKey: request.spendingPublicKey,
        viewingPrivateKey: request.viewingPrivateKey,
        zcashAddress: request.zcashAddress,
      });
      // verifyMessage throws on a malformed signature; treat that as invalid
      // rather than leaking the internal crypto error to the caller.
      let isValidSignature = false;
      try {
        isValidSignature = await verifyMessage({
          address: request.ensData.eoaAddress as Address,
          message: signedMessage,
          signature: request.signature.signature,
        });
      } catch {
        isValidSignature = false;
      }
      if (!isValidSignature) {
        logger.warn(`Invalid registration signature for ${request.ensData.eoaAddress}`, 'UserService');
        throw new Error('Invalid signature: signer does not match eoaAddress');
      }

      logger.info('Registration signature verified', 'UserService');

      // Check if user already exists (check all users, not just active)
      const existingUserByEoa = await StealthUserModel.findByEoaAddress(request.ensData.eoaAddress.toLowerCase());
      if (existingUserByEoa) {
        logger.warn('User already exists with this EOA address', 'UserService');
        throw new Error('User already exists with this EOA address');
      }

      logger.info('Checking if ENS username is already taken', 'UserService');

      // Check if ENS username is already taken
      const existingEnsUsername = await StealthUserModel.findByName(request.ensData.ensUsername);
      if (existingEnsUsername) {
        logger.warn('ENS username already taken', 'UserService');
        throw new Error('ENS username already taken');
      }

      // Privacy is always enabled - extract required stealth keys
      if (!request.spendingPublicKey || !request.viewingPrivateKey) {
        throw new Error('spendingPublicKey and viewingPrivateKey are required');
      }
      if (!request.zcashAddress) {
        throw new Error('zcashAddress is required');
      }
      
      const spendingPublicKey = request.spendingPublicKey;
      const viewingPrivateKey = request.viewingPrivateKey;
      logger.info('Using provided stealth keys', 'UserService');

      // Support all chains by default - get all available chains from chainManager
      const allChainIds = chainManager.getAllChains();
      const supportedChainsArray = allChainIds;
      
      // Initialize stealth address nonces for all supported chains
      const chainNonces: Record<string, number> = {};
      // Initialize smart account nonces for all supported chains
      const smartAccountNonces: Record<string, number> = {};
      supportedChainsArray.forEach((chainId) => {
        chainNonces[chainId.toString()] = 0;
        smartAccountNonces[chainId.toString()] = 0;
      });

      logger.info(`Supporting all chains: ${JSON.stringify(supportedChainsArray)}`, 'UserService');

      // AutoShield modules are configured per chain in chain configs
      // Modules will be installed during account creation, so we store empty array
      // The actual module addresses come from chain configs (nearIntentBridgeModule)
      const convertedModules: Array<{ address: string; chainId: number; data: string }> = [];

      // Create ENS username and stealth user records
      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

      // Ensure addresses includes coinType 60 (Ethereum) - default to EOA address if not provided
      const addresses = request.ensData.addresses || {};
      if (!addresses['60']) {
        addresses['60'] = request.ensData.eoaAddress;
      }

      // Create ENS username record
      await EnsUsernameModel.create({
        name: request.ensData.ensUsername,
        owner: request.ensData.eoaAddress.toLowerCase(),
        texts: request.ensData.texts ? JSON.stringify(request.ensData.texts) : null,
        addresses: JSON.stringify(addresses),
        contenthash: request.ensData.contenthash || null,
      });

      // Create stealth user record
      await StealthUserModel.create({
        id: userId,
        ensUsername: request.ensData.ensUsername,
        eoaAddress: request.ensData.eoaAddress.toLowerCase(),
        spendingPublicKey: spendingPublicKey,
        viewingPrivateKey: viewingPrivateKey,
        supportedChains: supportedChainsArray,
        chainNonces: chainNonces, // Stealth address nonces
        smartAccountNonces: smartAccountNonces, // Smart account nonces
        modules: convertedModules,
        eigenAiEnabled: false, // Always false, removed from API
        privacyEnabled: true, // Always true - privacy is always enabled
        isActive: true,
        zcashAddress: request.zcashAddress,
      });

      const result = {
        success: true,
        ensUsername: request.ensData.ensUsername,
      };

      logger.info(`User registered successfully: ${request.ensData.ensUsername}`, 'UserService');
      return result;
    } catch (error) {
      logger.error('Failed to register user', 'UserService', error);
      throw error;
    }
  }

  /**
   * Validate register request data
   * @private
   */
  private static validateRegisterRequest(request: RegisterRequest): void {
    const { ensData, spendingPublicKey, viewingPrivateKey, zcashAddress, signature } = request;

    // Validate ENS data
    if (!ensData.ensUsername || typeof ensData.ensUsername !== 'string') {
      throw new Error('Invalid ENS username');
    }

    // Validate ENS name is under assuranet.eth domain
    const expectedSuffix = `.${ENS_DOMAIN}`;
    if (!ensData.ensUsername.endsWith(expectedSuffix)) {
      throw new Error(`ENS username must be a subdomain under ${ENS_DOMAIN}. Expected format: username.${ENS_DOMAIN}`);
    }

    // Extract subdomain (everything before .assuranet.eth)
    const subdomain = ensData.ensUsername.replace(expectedSuffix, '');
    if (!subdomain || subdomain.length === 0) {
      throw new Error(`ENS username must include a subdomain (e.g., alice.${ENS_DOMAIN})`);
    }

    if (!ensData.eoaAddress || typeof ensData.eoaAddress !== 'string') {
      throw new Error('Invalid EOA address');
    }

    // Addresses are optional - will default to coinType 60 with EOA address if not provided
    if (ensData.addresses && typeof ensData.addresses !== 'object') {
      throw new Error('Invalid addresses - must be an object');
    }

    if (!ensData.texts || typeof ensData.texts !== 'object') {
      throw new Error('Invalid texts object');
    }

    // Validate required privacy keys (always required)
    if (!spendingPublicKey || typeof spendingPublicKey !== 'string') {
      throw new Error('spendingPublicKey is required');
    }
    if (!viewingPrivateKey || typeof viewingPrivateKey !== 'string') {
      throw new Error('viewingPrivateKey is required');
    }
    if (!zcashAddress || typeof zcashAddress !== 'string') {
      throw new Error('zcashAddress is required');
    }

    // Validate signature
    if (!signature.signature || typeof signature.signature !== 'string') {
      throw new Error('Invalid signature');
    }

    if (!signature.expiration || typeof signature.expiration !== 'number') {
      throw new Error('Invalid signature expiration');
    }
  }

  /**
   * Generate a stealth address for a user
   * @param eoaAddress - The EOA address of the user
   * @param chainId - The chain ID (not used for generation, but stored with the address)
   * @param tokenAddress - Optional token address
   * @param tokenAmount - Optional token amount
   * @returns The generated stealth address with nonce and constant address flag
   */
  static async generateStealthAddress(
    eoaAddress: string,
    chainId: number,
    tokenAddress?: Hex,
    tokenAmount?: string
  ): Promise<{ stealthAddress: Hex; nonce: number; isConstantAddress?: boolean }> {
    try {
      logger.info(`Generating stealth address for user: ${eoaAddress}`, 'UserService');

      // Get user
      const user = await StealthUserModel.findByEoaAddress(eoaAddress.toLowerCase(), true);
      if (!user) {
        logger.warn(`User not found for address: ${eoaAddress}`, 'UserService');
        throw new StealthValidationError('User not found');
      }

      // Always derive using the default chain id for cross-chain consistency
      const effectiveChainId = DEFAULT_CHAIN_ID;

      // Parse supportedChains and chainNonces from JSON
      const supportedChains = (user.supportedChains as number[]) || [];
      const chainNonces = (user.chainNonces as Record<string, number>) || {};

      // Validate chain support for the effective chain (must be present)
      if (!supportedChains.includes(effectiveChainId)) {
        logger.info(`Auto-healing: adding default chain ${effectiveChainId} to user's supported chains`, 'UserService');
        // Auto-heal: add default chain to user's supportedChains and initialize nonce
        const updatedSupportedChains = Array.from(new Set([...supportedChains, effectiveChainId]));
        const updatedChainNonces = {
          ...chainNonces,
          [effectiveChainId.toString()]: chainNonces[effectiveChainId.toString()] ?? 0,
        };

        const updatedUser = await StealthUserModel.updateChainsAndNonces(
          user.id,
          updatedSupportedChains,
          updatedChainNonces
        );

        // Update user object for subsequent use
        user.supportedChains = updatedUser.supportedChains;
        user.chainNonces = updatedUser.chainNonces;
      }

      // If privacy is disabled, return the constant address
      if (!user.privacyEnabled) {
        logger.info(`Privacy disabled for user ${eoaAddress}, returning constant address`, 'UserService');
        return {
          stealthAddress: eoaAddress as Hex,
          nonce: 0,
          isConstantAddress: true,
        };
      }

      // Privacy is enabled, generate stealth address
      if (!user.viewingPrivateKey || !user.spendingPublicKey) {
        logger.error(`Privacy keys not found for user: ${eoaAddress}`, 'UserService');
        throw new StealthValidationError('Privacy keys not found - user may have been registered without privacy');
      }

      // Get next nonce for the effective chain only
      // getCurrentNonce returns the next nonce to use (stored in chainNonces[chainId])
      // - First time: returns 0 (not set), we'll generate with nonce 0, then update to 1
      // - Second time: returns 1, we'll generate with nonce 1, then update to 2
      // - And so on...
      const nextNonce = await StealthUserModel.getCurrentNonce(user.id, effectiveChainId);

      logger.info(`Generating stealth address with nonce ${nextNonce} for chain ${effectiveChainId}`, 'UserService');

      // Generate stealth address
      const result = await computeStealthAddresses({
        viewingPrivateKey: user.viewingPrivateKey as Hex,
        spendingPublicKey: user.spendingPublicKey as Hex,
        startNonce: nextNonce,
        accountAmount: 1,
        chainId: effectiveChainId,
      });

      if (result.addresses.length === 0) {
        logger.error(`Failed to generate stealth address for user: ${eoaAddress}`, 'UserService');
        throw new StealthGenerationError('Failed to generate stealth address');
      }

      const stealthAddress = result.addresses[0];

      // Store stealth address record (smart account data will be added later in getRecord)
      const addressId = `addr_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      await StealthAddressModel.create({
        id: addressId,
        userId: user.id,
        eoaAddress: eoaAddress.toLowerCase(),
        stealthNonce: stealthAddress.nonce,
        stealthAddress: stealthAddress.address,
        smartAccountNonce: 0, // Will be updated in getRecord
        chainId: effectiveChainId,
        tokenAddress: tokenAddress || null,
        tokenAmount: tokenAmount || null,
        isUsed: false,
      });

      // Update user's nonce for the effective chain only
      // Get fresh chainNonces from database to ensure we have the latest state
      const freshUser = await StealthUserModel.findByEoaAddress(eoaAddress.toLowerCase(), true);
      if (!freshUser) {
        throw new StealthValidationError('User not found after address generation');
      }
      const freshChainNonces = (freshUser.chainNonces as Record<string, number>) || {};
      
      // Increment the nonce: if we just used nonce N, the next nonce should be N+1
      const updatedChainNonces = {
        ...freshChainNonces,
        [effectiveChainId.toString()]: stealthAddress.nonce + 1,
      };
      await StealthUserModel.updateChainNonces(user.id, updatedChainNonces);

      logger.info(`Successfully generated stealth address ${stealthAddress.address} for user: ${eoaAddress}`, 'UserService');

      return {
        stealthAddress: stealthAddress.address,
        nonce: stealthAddress.nonce,
        isConstantAddress: false,
      };
    } catch (error) {
      if (error instanceof StealthError) {
        throw error;
      }
      logger.error(`Failed to generate stealth address for user: ${eoaAddress}`, 'UserService', error);
      throw new StealthError('Failed to generate stealth address', 'GENERATION_FAILED', { error });
    }
  }

  /**
   * Get CCIP Record Query result
   * Handles addr, text, and contenthash queries for ENS resolution
   * @param name - The ENS name to resolve
   * @param query - The resolver query (addr, text, or contenthash)
   * @returns The resolved result as a string
   */
  static async getRecord(name: string, query: ResolverQuery): Promise<string> {
    try {
      logger.info(`[CCIP-Read] Starting record query for name: ${name}`, 'UserService');
      logger.info(`[CCIP-Read] Query: ${query.functionName}`, 'UserService');

      // Validate ENS name is under assuranet.eth domain
      const expectedSuffix = `.${ENS_DOMAIN}`;
      if (!name.endsWith(expectedSuffix)) {
        logger.warn(`[CCIP-Read] ENS name ${name} is not under ${ENS_DOMAIN} domain`, 'UserService');
        // Return zero address for invalid domain
        return '0x0000000000000000000000000000000000000000';
      }

      const { functionName, args } = query;

      // Get ENS name data from database
      logger.info(`[CCIP-Read] Fetching name data from database`, 'UserService');
      const nameData = await EnsUsernameModel.findByName(name);
      logger.info(`[CCIP-Read] Name data found: ${!!nameData}`, 'UserService');

      let res: string = zeroAddress; // Initialize with zero address as default

      switch (functionName) {
        case 'addr': {
          const coinType = args[1] ?? BigInt(60);
          logger.info(`[CCIP-Read] Address query for coin type: ${coinType}`, 'UserService');

          // Map coinType to chainId
          // coinType 60 = Ethereum, but we use Base (8453) as default for EVM chains
          // For other coinTypes, use them directly as chainId
          const coinTypeToChainId: Record<number, number> = {
            60: 8453, // Ethereum -> Base (default EVM chain)
            // Add more mappings if needed
          };
          const chainId = coinTypeToChainId[Number(coinType)] ?? Number(coinType);
          logger.info(`[CCIP-Read] Mapped coinType ${coinType} to chainId ${chainId}`, 'UserService');

          // Check if this is a stealth-enabled user
          if (nameData?.owner) {
            logger.info(`[CCIP-Read] Owner found, checking for stealth user: ${nameData.owner}`, 'UserService');
            try {
              // Check if user exists in stealth_users table
              logger.info(`[CCIP-Read] Checking stealth user data`, 'UserService');
              const stealthUser = await StealthUserModel.findByEoaAddress(nameData.owner.toLowerCase(), true);
              logger.info(`[CCIP-Read] Stealth user found: ${!!stealthUser}`, 'UserService');

              if (stealthUser) {
                // User has stealth addresses configured - privacy is always enabled
                logger.info(`[CCIP-Read] Processing stealth user for chain: ${chainId}`, 'UserService');

                // Privacy is always enabled: generate new stealth address and compute smart account
                logger.info(`[CCIP-Read] Generating new stealth address (privacy always enabled)`, 'UserService');
                const stealthResult = await UserService.generateStealthAddress(
                  nameData.owner.toLowerCase(),
                  chainId
                );
                logger.info(`[CCIP-Read] Stealth address generated: ${stealthResult.stealthAddress}`, 'UserService');

                // Compute smart account with stealth address as owner
                // The stealth address itself (bytes20 -> uint256) is used as the InstallConfig nonce
                const smartAccountResult = await computeSmartAccountForENS(
                  stealthResult.stealthAddress,
                  chainId
                );

                if (smartAccountResult.success && smartAccountResult.address && smartAccountResult.initData) {
                  res = smartAccountResult.address;
                  logger.info(`[CCIP-Read] Returning smart account with stealth owner: ${res}`, 'UserService');

                  // Store stealth address with smart account data
                  // Find the stealth address record we just created (should be the most recent one)
                  const stealthAddresses = await StealthAddressModel.findByUserIdAndChain(stealthUser.id, chainId);
                  const latestStealthAddress = stealthAddresses.find(
                    (addr) => addr.stealthAddress.toLowerCase() === stealthResult.stealthAddress.toLowerCase()
                  );

                  if (latestStealthAddress) {
                    // Update with smart account data
                    // Note: smartAccountNonce is not used anymore (stealth address is used as nonce)
                    await StealthAddressModel.update({
                      id: latestStealthAddress.id,
                      smartAccountAddress: smartAccountResult.address,
                      initData: smartAccountResult.initData,
                    });
                    logger.info(`[CCIP-Read] Updated stealth address record with smart account data`, 'UserService');
                  } else {
                    logger.warn(`[CCIP-Read] Could not find stealth address record to update`, 'UserService');
                  }

                  // Also compute and store smart accounts for all other supported chains
                  // This ensures deposit monitor can find them
                  // Note: generateStealthAddress uses DEFAULT_CHAIN_ID internally, so we get the same stealth address
                  // We just need to compute smart accounts for other chains using that same stealth address
                  const allSupportedChains = (stealthUser.supportedChains as number[]) || [];
                  const otherChains = allSupportedChains.filter((c) => c !== chainId);
                  
                  if (otherChains.length > 0) {
                    logger.info(`[CCIP-Read] Computing smart accounts for ${otherChains.length} additional chains`, 'UserService');
                    
                    // Use the same stealth address for all chains (consistent owner)
                    // The stealth address was generated using DEFAULT_CHAIN_ID, so it's consistent across chains
                    for (const otherChainId of otherChains) {
                      try {
                        const otherSmartAccountResult = await computeSmartAccountForENS(
                          stealthResult.stealthAddress,
                          otherChainId
                        );

                        if (otherSmartAccountResult.success && otherSmartAccountResult.address && otherSmartAccountResult.initData) {
                          // Check if a stealth address record already exists for this chain with this stealth address
                          const otherStealthAddresses = await StealthAddressModel.findByUserIdAndChain(stealthUser.id, otherChainId);
                          const existingRecord = otherStealthAddresses.find(
                            (addr) => addr.stealthAddress.toLowerCase() === stealthResult.stealthAddress.toLowerCase()
                          );

                          if (existingRecord) {
                            // Update existing record
                            await StealthAddressModel.update({
                              id: existingRecord.id,
                              smartAccountAddress: otherSmartAccountResult.address,
                              initData: otherSmartAccountResult.initData,
                            });
                            logger.info(`[CCIP-Read] Updated stealth address record for chain ${otherChainId}`, 'UserService');
                          } else {
                            // Create a new record for this chain with the same stealth address
                            // Use the same stealthNonce since it's the same stealth address
                            const addressId = `addr_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                            await StealthAddressModel.create({
                              id: addressId,
                              userId: stealthUser.id,
                              eoaAddress: nameData.owner.toLowerCase(),
                              stealthNonce: stealthResult.nonce,
                              stealthAddress: stealthResult.stealthAddress,
                              smartAccountNonce: 0, // Not used, but required by schema
                              smartAccountAddress: otherSmartAccountResult.address,
                              initData: otherSmartAccountResult.initData,
                              chainId: otherChainId,
                              tokenAddress: null,
                              tokenAmount: null,
                              isUsed: false,
                            });
                            logger.info(`[CCIP-Read] Created stealth address record for chain ${otherChainId}`, 'UserService');
                          }
                        } else {
                          logger.warn(`[CCIP-Read] Failed to compute smart account for chain ${otherChainId}: ${otherSmartAccountResult.error}`, 'UserService');
                        }
                      } catch (error) {
                        logger.warn(`[CCIP-Read] Error computing smart account for chain ${otherChainId}`, 'UserService', error);
                      }
                    }
                  }
                } else {
                  // Fallback to stealth address if smart account computation fails
                  res = stealthResult.stealthAddress;
                  logger.warn(`[CCIP-Read] Smart account computation failed, falling back to stealth address: ${res}`, 'UserService');
                  logger.warn(`[CCIP-Read] Smart account error: ${smartAccountResult.error || 'Unknown error'}`, 'UserService');
                }
                
                // Ensure res is set before breaking
                if (!res) {
                  logger.error(`[CCIP-Read] Failed to set result, using stealth address as fallback`, 'UserService');
                  res = stealthResult.stealthAddress;
                }
                break;
              } else {
                logger.info(`[CCIP-Read] No stealth user found, using regular address`, 'UserService');
              }
            } catch (error) {
              // If stealth address generation fails, log error and fall back
              logger.error(`[CCIP-Read] Stealth address generation failed`, 'UserService', error);
              // Don't set res here - let it fall through to zero address
            }
          } else {
            logger.info(`[CCIP-Read] No owner found`, 'UserService');
          }

          // Fallback to regular address resolution only if res is not already set
          if (!res) {
            let addresses: Record<string, string> = {};
            if (nameData?.addresses) {
              try {
                addresses = JSON.parse(nameData.addresses);
              } catch (e) {
                logger.warn(`[CCIP-Read] Failed to parse addresses JSON`, 'UserService', e);
              }
            }
            res = addresses[coinType.toString()] ?? zeroAddress;
            logger.info(`[CCIP-Read] Returning fallback address: ${res}`, 'UserService');
          }
          break;
        }

        case 'text': {
          const key = args[1] as string;
          // Parse texts JSON if it exists, otherwise use empty object
          const texts = nameData?.texts ? (JSON.parse(nameData.texts) as Record<string, string>) : {};

          // Check for Zcash address queries - return from stealth user if available
          if (key === 'zcash' || key === 'com.zcash.address' || key === 'org.zcash.address') {
            if (nameData?.owner) {
              const stealthUser = await StealthUserModel.findByEoaAddress(nameData.owner.toLowerCase(), true);
              if (stealthUser?.zcashAddress) {
                res = stealthUser.zcashAddress;
                logger.info(`[CCIP-Read] Returning Zcash address from stealth user: ${res}`, 'UserService');
                break;
              }
            }
          }

          res = texts?.[key] ?? '';
          logger.info(`[CCIP-Read] Returning text value for key ${key}: ${res}`, 'UserService');
          break;
        }

        case 'contenthash': {
          res = nameData?.contenthash ?? '0x';
          logger.info(`[CCIP-Read] Returning contenthash: ${res}`, 'UserService');
          break;
        }

        default: {
          throw new Error(`Unsupported query function ${functionName}`);
        }
      }

      return res;
    } catch (error) {
      logger.error(`[CCIP-Read] Error in getRecord for name: ${name}`, 'UserService', error);
      throw error;
    }
  }

}
