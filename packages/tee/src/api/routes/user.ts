// User API Routes

import { Router } from 'itty-router';
import { UserService } from '../../services/user';
import { ChainService } from '../../services/chain';
import { StealthUserModel } from '../../database/models/stealth-user';
import { logger } from '../../managers/log';
import type { Address } from 'viem';

/**
 * Helper to add CORS headers to responses
 */
function addCorsHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * Handler for GET /get/:name
 * Query ENS username by name and compute smart account addresses
 * Can be used at /api/user/get/:name or /get/:name
 * 
 * This handler implements the same logic as UserService.getRecord for 'addr' queries,
 * but computes smart account addresses for ALL supported chains instead of a single chainId.
 * 
 * Logic flow:
 * 1. Fetch ENS username from database
 * 2. If stealth user exists:
 *    - If privacy enabled: generate stealth address once, compute smart accounts for all supported chains
 *    - If privacy disabled: compute smart accounts for all supported chains with EOA owner
 * 3. Return full ENS record with computed addresses for all chains
 */
export async function handleGetEnsUsername(request: Request): Promise<Response> {
  try {
    const { name } = (request as { params?: { name?: string } }).params || {};
    
    logger.info(`🔍 [get] Looking up name in database: ${name}`, 'UserAPI');
    
    if (!name) {
      return new Response(
        JSON.stringify({ error: 'Username parameter is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get ENS username from database
    const ensUsername = await UserService.getEnsUsername(name);

    if (!ensUsername) {
      logger.info(`❌ [get] No record found for name: ${name}`, 'UserAPI');
      return new Response(
        JSON.stringify({ error: 'ENS username not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info(`🔍 [get] Database record found:`, 'UserAPI', ensUsername);

    // Parse the record - addresses and texts are stored as JSON strings
    const parsedRecord: any = {
      name: ensUsername.name,
      owner: ensUsername.owner,
      addresses: ensUsername.addresses ? JSON.parse(ensUsername.addresses) : {},
      texts: ensUsername.texts ? JSON.parse(ensUsername.texts) : {},
      contenthash: ensUsername.contenthash,
      createdAt: ensUsername.createdAt,
      updatedAt: ensUsername.updatedAt,
    };

    logger.info(`🔍 [get] Parsed record:`, 'UserAPI', parsedRecord);

    // Check if this is a stealth-enabled user and generate smart account addresses
    if (parsedRecord?.owner) {
      logger.info(`🔍 [get] Owner found, checking for stealth user: ${parsedRecord.owner}`, 'UserAPI');
      
      try {
        // Check if user exists in stealth_users table
        logger.info(`🔍 [get] Checking stealth user data`, 'UserAPI');
        const stealthUser = await StealthUserModel.findByEoaAddress(parsedRecord.owner.toLowerCase(), true);
        
        logger.info(`🔍 [get] Stealth user data:`, 'UserAPI', stealthUser ? 'Found' : 'Not found');
        
        if (stealthUser) {
          logger.info(`🔍 [get] User found, processing based on privacy settings`, 'UserAPI');
          
          const updatedAddresses = { ...parsedRecord.addresses };
          
          if (stealthUser.privacyEnabled) {
            logger.info(`🔍 [get] User has privacy enabled, generating stealth addresses and computing smart accounts`, 'UserAPI');
            
            // Generate one stealth address using default chain and apply to all chains
            try {
              // Parse supported chains
              const supportedChains: number[] = Array.isArray(stealthUser.supportedChains)
                ? stealthUser.supportedChains.map((c: any) => typeof c === 'number' ? c : parseInt(c.toString(), 10))
                : [];
              
              // Use the first supported chain as default, or fall back to chainId 1
              // Note: generateStealthAddress internally uses DEFAULT_CHAIN_ID, but we pass a chainId for consistency
              const defaultChain = supportedChains.length > 0 ? supportedChains[0] : 1;
              
              logger.info(`🔍 [get] Generating stealth address once using default chain: ${defaultChain}`, 'UserAPI');
              
              const stealthResult = await UserService.generateStealthAddress(
                parsedRecord.owner.toLowerCase() as Address,
                defaultChain
              );
              
              logger.info(`🔍 [get] Stealth address (default chain) result:`, 'UserAPI', stealthResult);
              
              // Compute smart accounts for each supported chain with stealth address as owner
              for (const chainId of supportedChains) {
                const smartAccountResult = await ChainService.computeSmartAccountAddress(
                  stealthUser,
                  chainId,
                  stealthResult.stealthAddress
                );
                
                if (smartAccountResult.success && smartAccountResult.smartAccountAddress) {
                  updatedAddresses[chainId.toString()] = smartAccountResult.smartAccountAddress;
                  logger.info(`✅ [get] Computed smart account for chain ${chainId}: ${smartAccountResult.smartAccountAddress}`, 'UserAPI');
                } else {
                  // Fallback to stealth address if smart account computation fails
                  updatedAddresses[chainId.toString()] = stealthResult.stealthAddress;
                  logger.warn(`⚠️ [get] Smart account computation failed for chain ${chainId}, using stealth address: ${stealthResult.stealthAddress}`, 'UserAPI');
                }
              }
              
              logger.info(`✅ [get] Applied smart accounts with stealth owners to all supported chains`, 'UserAPI');
              
              // Attach stealth metadata
              const chainNonces = (stealthUser.chainNonces && typeof stealthUser.chainNonces === 'object')
                ? (stealthUser.chainNonces as Record<string, number>)
                : {};
              
              const nonceHead = chainNonces[defaultChain.toString()] ?? 0;
              
              parsedRecord.stealth = {
                defaultChainId: defaultChain,
                nonceHead: typeof nonceHead === 'number' ? nonceHead : 0,
              };
            } catch (error) {
              logger.warn(`⚠️ [get] Failed to generate stealth address:`, 'UserAPI', error);
            }
          } else {
            logger.info(`🔍 [get] User has privacy disabled, computing smart accounts with EOA owner`, 'UserAPI');
            
            // Parse supported chains
            const supportedChains: number[] = Array.isArray(stealthUser.supportedChains)
              ? stealthUser.supportedChains.map((c: any) => typeof c === 'number' ? c : parseInt(c.toString(), 10))
              : [];
            
            // Compute smart accounts for each supported chain with EOA as owner
            for (const chainId of supportedChains) {
              const smartAccountResult = await ChainService.computeSmartAccountAddress(
                stealthUser,
                chainId,
                stealthUser.eoaAddress.toLowerCase() as Address
              );
              
              if (smartAccountResult.success && smartAccountResult.smartAccountAddress) {
                updatedAddresses[chainId.toString()] = smartAccountResult.smartAccountAddress;
                logger.info(`✅ [get] Computed smart account for chain ${chainId}: ${smartAccountResult.smartAccountAddress}`, 'UserAPI');
              } else {
                // Fallback to EOA address if smart account computation fails
                updatedAddresses[chainId.toString()] = stealthUser.eoaAddress;
                logger.warn(`⚠️ [get] Smart account computation failed for chain ${chainId}, using EOA address: ${stealthUser.eoaAddress}`, 'UserAPI');
              }
            }
            
            logger.info(`✅ [get] Applied smart accounts with EOA owners to all supported chains`, 'UserAPI');
          }
          
          // Update the parsed record with computed addresses
          parsedRecord.addresses = updatedAddresses;
          logger.info(`✅ [get] Updated parsed record with computed addresses:`, 'UserAPI', parsedRecord);
        } else {
          logger.info(`ℹ️ [get] No stealth user found, using regular addresses`, 'UserAPI');
        }
      } catch (error) {
        // If stealth address generation fails, fall back to regular addresses
        logger.warn(`⚠️ [get] Stealth address generation failed, falling back to regular addresses:`, 'UserAPI', error);
      }
    } else {
      logger.info(`ℹ️ [get] No owner found, using regular addresses`, 'UserAPI');
    }

    logger.info(`✅ [get] Final parsed record:`, 'UserAPI', parsedRecord);

    return new Response(JSON.stringify(parsedRecord), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    logger.error('Error in GET /get/:name', 'UserAPI', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handler for POST /register
 * Register a new user
 * Can be used at /api/user/register or /set
 */
export async function handleRegisterUser(request: Request): Promise<Response> {
  try {
    const body = await request.json() as any;

    logger.info('POST /register - Received registration request', 'UserAPI');

    // Remove privacyEnabled if present (it's always enabled now)
    const { privacyEnabled, ...registrationData } = body;

    const result = await UserService.registerUser(registrationData as any);

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    logger.error('Error in POST /register', 'UserAPI', error);
    
    const errorMessage = (error as Error).message || 'Internal server error';
    const statusCode = errorMessage.includes('already exists') || errorMessage.includes('already taken') 
      ? 409 
      : errorMessage.includes('Invalid') || errorMessage.includes('Unsupported')
      ? 400
      : 500;

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: statusCode,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

/**
 * Create user routes
 * Returns a router with all user endpoints
 * 
 * TODO: Investigate nested router path handling in itty-router v4
 * Currently using absolute paths. Should use relative paths when mounting with wildcards.
 * See: https://github.com/kwhitley/itty-router for proper nested routing patterns
 */
export function createUserRoutes() {
  const router = Router();

  /**
   * GET /api/user/get/:name
   * Query ENS username by name
   */
  router.get('/api/user/get/:name', handleGetEnsUsername);

  /**
   * POST /api/user/register
   * Register a new user
   */
  router.post('/api/user/register', handleRegisterUser);

  /**
   * POST /api/user/activeNonce
   * Get active nonce for a user after verifying signature
   */
  router.post('/api/user/activeNonce', async (request: Request) => {
    try {
      const body = await request.json() as { eoaAddress?: string; signature?: string };
      const { eoaAddress, signature } = body;

      logger.info(`POST /api/user/activeNonce - EOA Address: ${eoaAddress}`, 'UserAPI');

      if (!eoaAddress || !signature) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Missing eoaAddress or signature',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const result = await UserService.getActiveNonce(eoaAddress, signature);

      if (!result.success) {
        const statusCode = result.error === 'Invalid signature' ? 401 : result.error === 'User not found' ? 404 : 500;
        return new Response(
          JSON.stringify({
            success: false,
            error: result.error,
          }),
          {
            status: statusCode,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            eoaAddress: result.data.eoaAddress,
            ensUsername: result.data.ensUsername,
            supportedChains: result.data.supportedChains,
            chainNonces: result.data.chainNonces,
            privacyEnabled: result.data.privacyEnabled,
            isActive: result.data.isActive,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      logger.error('Error in POST /api/user/activeNonce', 'UserAPI', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: (error as Error).message || 'Internal server error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  });

  /**
   * GET /api/user/list
   * List all users with pagination
   * Query params: ?page=1&pageSize=10
   */
  router.get('/api/user/list', async (request: Request) => {
    try {
      const { page, pageSize } = (request as any).query || {};
      const pageNum = parseInt(page || '1', 10);
      const pageSizeNum = parseInt(pageSize || '10', 10);

      // Validate pagination parameters
      if (pageNum < 1 || isNaN(pageNum)) {
        return new Response(
          JSON.stringify({ error: 'Page must be greater than 0' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (pageSizeNum < 1 || pageSizeNum > 100 || isNaN(pageSizeNum)) {
        return new Response(
          JSON.stringify({ error: 'Page size must be between 1 and 100' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const result = await UserService.listUsers({ page: pageNum, pageSize: pageSizeNum });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      logger.error('Error in GET /api/user/list', 'UserAPI', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  });

  return router;
}

