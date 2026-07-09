// CCIP (Cross-Chain Interoperability Protocol) Routes
// For ENS Offchain Resolver

import { UserService } from '../../services/user';
import { logger } from '../../managers/log';
import { decodeEnsOffchainRequest, encodeEnsOffchainResponse } from '../../utils/ccip';
import { hexToBytes } from 'viem';
import type { Hex } from 'viem';

/**
 * Shared handler for CCIP Record Query endpoints
 * Handles both /lookup/:sender/:data.json and /:sender/:data.json routes
 */
export async function handleCcipRecordQuery(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    logger.info(`CCIP Request: ${url.pathname}`, 'CCIP');
    logger.info(`Path parts: ${JSON.stringify(pathParts)}`, 'CCIP');

    // Handle both /:sender/:data.json and /lookup/:sender/:data.json formats
    // Extract sender and data from path
    let sender: string | undefined;
    let data: string | undefined;

    if (pathParts.length >= 2) {
      // Remove .json suffix if present
      const lastPart = pathParts[pathParts.length - 1];
      const dataWithSuffix = lastPart.endsWith('.json') ? lastPart.slice(0, -5) : lastPart;
      
      sender = pathParts[pathParts.length - 2];
      data = dataWithSuffix;
    } else {
      // Try to get from params (for router-based extraction)
      const params = (request as { params?: { sender?: string; data?: string } }).params;
      sender = params?.sender;
      data = params?.data;
      if (data?.endsWith('.json')) {
        data = data.slice(0, -5);
      }
    }

    logger.info(`Extracted sender: ${sender}, data length: ${data?.length}`, 'CCIP');

    if (!sender || !data) {
      logger.warn(`Missing sender or data in CCIP request`, 'CCIP', { sender: !!sender, data: !!data });
      // For CCIP-Read, invalid requests should return empty/zero response
      // The resolver contract will handle the error
      return new Response('0x', {
        status: 400,
        headers: { 
          'Content-Type': 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Ensure data starts with 0x
    const dataHex = data.startsWith('0x') ? (data as `0x${string}`) : (`0x${data}` as `0x${string}`);
    const senderHex = sender.startsWith('0x') ? (sender as `0x${string}`) : (`0x${sender}` as `0x${string}`);

    logger.info(`Decoding CCIP request for sender: ${senderHex}`, 'CCIP');

    // Decode the CCIP request
    const decoded = decodeEnsOffchainRequest({
      sender: senderHex,
      data: dataHex,
    });

    logger.info(`Decoded ENS name: ${decoded.name}, query: ${decoded.query.functionName}`, 'CCIP');

    // Get the record result
    const result = await UserService.getRecord(decoded.name, decoded.query);

    // Encode and sign the response
    const signerPrivateKey = process.env.PRIVATE_KEY as Hex;
    if (!signerPrivateKey) {
      throw new Error('PRIVATE_KEY environment variable is not set');
    }

    const encodedResponse = await encodeEnsOffchainResponse(
      {
        sender: sender as `0x${string}`,
        data: data as `0x${string}`,
      },
      result,
      signerPrivateKey
    );

    // Return hex-encoded string in JSON format
    // The gateway expects a JSON response with hex-encoded data
    // The response is ABI-encoded: (bytes result, uint64 expires, bytes sig)
    // Standard ENS off-chain resolver format
    // According to CCIP-Read spec and standard implementation:
    // - Response should be JSON: { "data": "0x..." }
    // Reference: https://github.com/gskril/ens-offchain-registrar
    
    const jsonResponse = JSON.stringify({ data: encodedResponse });
    
    return new Response(jsonResponse, {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  } catch (error) {
    const url = new URL(request.url);
    logger.error(`Error in GET ${url.pathname}`, 'CCIP', error);
    // For CCIP-Read errors, return empty response (standard behavior)
    // The resolver contract will handle the error
    return new Response('0x', {
      status: 500,
      headers: { 
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}


