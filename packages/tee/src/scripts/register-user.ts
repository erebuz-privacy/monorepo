#!/usr/bin/env bun

/**
 * User Registration Script
 * 
 * Register a new user with Assura network
 * 
 * Usage:
 *   bun run src/scripts/register-user.ts --username alice.assuranet.eth --private-key 0x... [options]
 * 
 * Options:
 *   --username, -u        ENS username (must end with .assuranet.eth)
 *   --private-key, -k     EOA private key (for signing)
 *   --privacy, -p         Enable privacy (stealth addresses)
 *   --zcash, -z           Zcash address for automatic bridging
 *   --help, -h            Show help message
 */

import { privateKeyToAccount, signMessage, generatePrivateKey } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import { extractViewingPrivateKeyNode, generateEphemeralPrivateKey } from '@fluidkey/stealth-account-kit';
import { secp256k1 } from 'ethereum-cryptography/secp256k1';
import { bytesToHex } from 'ethereum-cryptography/utils';
import { buildRegistrationMessage } from '../config/global-config';
import { pathToFileURL } from 'node:url';

// TEE endpoint
const TEE_ENDPOINT = process.env.TEE_ENDPOINT || 'https://tee.assura.network';

// Default Zcash address
const DEFAULT_ZCASH_ADDRESS = 't1ZDaT2nxFXcx8BmW6cx1UqtgsemdDe4A8b';

/**
 * Generate a random private key
 */
function generateRandomPrivateKey(): Hex {
  return generatePrivateKey();
}

/**
 * Generate a random username (subdomain under assuranet.eth)
 */
function generateRandomUsername(): string {
  // Generate a random string (8-12 characters)
  const length = Math.floor(Math.random() * 5) + 8; // 8-12 chars
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let username = '';
  
  // First character must be a letter
  username += chars.charAt(Math.floor(Math.random() * 26));
  
  // Rest can be letters or numbers
  for (let i = 1; i < length; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `${username}.assuranet.eth`;
}

interface RegistrationOptions {
  username: string;
  privateKey: Hex;
  zcashAddress: string;
  spendingPublicKey: Hex;
  viewingPrivateKey: Hex;
}

interface RegistrationResult {
  success: boolean;
  ensUsername?: string;
  error?: string;
}

/**
 * Generate stealth keys using Fluid Key SDK
 */
async function generateStealthKeysFunction(): Promise<{
  spendingPublicKey: Hex;
  viewingPrivateKey: Hex;
}> {
  // Generate a random private key for viewing
  const viewingPrivateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const viewingPrivateKey = `0x${Array.from(viewingPrivateKeyBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}` as Hex;

  // Extract viewing key node
  const viewingKeyNode = extractViewingPrivateKeyNode(viewingPrivateKey, 0);

  // Generate ephemeral private key for spending key derivation
  const ephemeralResult = generateEphemeralPrivateKey({
    viewingPrivateKeyNode: viewingKeyNode,
    nonce: 0n,
    chainId: 1, // Ethereum mainnet
  });

  // Get spending public key from ephemeral private key
  const ephemeralPrivateKeyRaw = ephemeralResult.ephemeralPrivateKey || ephemeralResult;
  let ephemeralPrivateKeyHex: string;
  
  if (typeof ephemeralPrivateKeyRaw === 'string') {
    ephemeralPrivateKeyHex = ephemeralPrivateKeyRaw.replace('0x', '');
  } else {
    ephemeralPrivateKeyHex = Array.from(ephemeralPrivateKeyRaw as Uint8Array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  const ephemeralPrivateKey = `0x${ephemeralPrivateKeyHex}` as Hex;
  const ephemeralPrivateKeyBytes = Buffer.from(ephemeralPrivateKey.slice(2), 'hex');
  const spendingPublicKeyBytes = secp256k1.getPublicKey(ephemeralPrivateKeyBytes);
  const spendingPublicKey = bytesToHex(spendingPublicKeyBytes) as Hex;

  return {
    spendingPublicKey,
    viewingPrivateKey,
  };
}

/**
 * Register a user with the TEE service
 */
export async function registerUser(options: RegistrationOptions): Promise<RegistrationResult> {
  try {
    const { username, privateKey, zcashAddress, spendingPublicKey, viewingPrivateKey } = options;

    // Validate username format
    if (!username.endsWith('.assuranet.eth')) {
      return {
        success: false,
        error: 'ENS username must end with .assuranet.eth',
      };
    }

    // Validate required fields
    if (!spendingPublicKey || !viewingPrivateKey || !zcashAddress) {
      return {
        success: false,
        error: 'spendingPublicKey, viewingPrivateKey, and zcashAddress are required',
      };
    }

    // Create account from private key
    const account = privateKeyToAccount(privateKey);
    const eoaAddress = account.address;

    // Calculate expiration (1 year from now)
    const expiration = Math.floor(Date.now() / 1000) + 86400 * 365;

    // Create canonical message to sign. This MUST match what the server
    // reconstructs in UserService.registerUser so the signature verifies.
    const message = buildRegistrationMessage({
      ensUsername: username,
      eoaAddress,
      expiration,
      spendingPublicKey,
      viewingPrivateKey,
      zcashAddress,
    });

    // Sign the message
    console.log('✍️  Signing registration message...');
    const signature = await signMessage({
      privateKey,
      message,
    });

    // Build registration request (privacy is always enabled)
    const registrationData = {
      ensData: {
        ensUsername: username,
        eoaAddress,
        addresses: {},
        texts: {},
      },
      spendingPublicKey,
      viewingPrivateKey,
      zcashAddress,
      signature: {
        signature,
        expiration,
      },
    };

    // Send registration request
    console.log(`📤 Registering user: ${username}...`);
    console.log(`   EOA Address: ${eoaAddress}`);
    console.log(`   Privacy Enabled: true (always enabled)`);
    console.log(`   Zcash Address: ${zcashAddress}`);

    const response = await fetch(`${TEE_ENDPOINT}/api/user/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registrationData),
    });

    const result = (await response.json()) as RegistrationResult | { error?: string };

    if (!response.ok) {
      return {
        success: false,
        error: 'error' in result ? result.error : `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    if ('success' in result && result.success) {
      console.log('✅ Registration successful!');
      console.log(`   ENS Username: ${result.ensUsername}`);
      console.log('\n📝 Your stealth keys (save these securely!):');
      console.log(`   Spending Public Key: ${spendingPublicKey}`);
      console.log(`   Viewing Private Key: ${viewingPrivateKey}`);
      console.log(`   Zcash Address: ${zcashAddress}`);
    }

    return result as RegistrationResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * CLI handler
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let username: string | undefined;
  let privateKey: Hex | undefined;
  let zcashAddress: string | undefined;
  let spendingPublicKey: Hex | undefined;
  let viewingPrivateKey: Hex | undefined;
  let generateKey = false;
  let generateUsername = false;
  let generateStealthKeys = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--username':
      case '-u':
        username = nextArg;
        i++;
        break;
      case '--private-key':
      case '-k':
        privateKey = nextArg as Hex;
        i++;
        break;
      case '--zcash':
      case '-z':
        zcashAddress = nextArg;
        i++;
        break;
      case '--spending-public-key':
        spendingPublicKey = nextArg as Hex;
        i++;
        break;
      case '--viewing-private-key':
        viewingPrivateKey = nextArg as Hex;
        i++;
        break;
      case '--generate-stealth-keys':
      case '--gen-stealth':
        generateStealthKeys = true;
        break;
      case '--generate-key':
      case '--gen-key':
        generateKey = true;
        break;
      case '--generate-username':
      case '--gen-username':
        generateUsername = true;
        break;
      case '--help':
      case '-h':
        console.log(`
User Registration Script

Usage:
  bun run src/scripts/register-user.ts [options]

Options:
  --username, -u <name>              ENS username (must end with .assuranet.eth)
  --private-key, -k <key>            EOA private key (0x...)
  --generate-key, --gen-key          Generate a random private key
  --generate-username, --gen-username Generate a random username
  --zcash, -z <address>              Zcash address (optional, defaults to t1ZDaT2nxFXcx8BmW6cx1UqtgsemdDe4A8b)
  --spending-public-key <key>        Spending public key (required)
  --viewing-private-key <key>        Viewing private key (required)
  --generate-stealth-keys, --gen-stealth Generate random stealth keys
  --help, -h                         Show this help message

Environment Variables:
  TEE_ENDPOINT                       TEE service endpoint (default: https://tee.assura.network)

Examples:
  # Registration with all required fields
  bun run src/scripts/register-user.ts \\
    --username alice.assuranet.eth \\
    --private-key 0x1234... \\
    --spending-public-key 0x5678... \\
    --viewing-private-key 0x9abc... \\
    --zcash t1abc123...

  # Generate random key, username, and stealth keys
  bun run src/scripts/register-user.ts \\
    --generate-key \\
    --generate-username \\
    --generate-stealth-keys \\
    --zcash t1abc123...

  # Generate random key and stealth keys with custom username
  bun run src/scripts/register-user.ts \\
    --username bob.assuranet.eth \\
    --generate-key \\
    --generate-stealth-keys \\
    --zcash t1abc123...
`);
        process.exit(0);
        break;
    }
  }

  // Generate random username if requested
  if (generateUsername) {
    username = generateRandomUsername();
    console.log(`🎲 Generated random username: ${username}`);
  }

  // Generate random private key if requested
  if (generateKey) {
    privateKey = generateRandomPrivateKey();
    const account = privateKeyToAccount(privateKey);
    console.log(`🔑 Generated random private key`);
    console.log(`   Private Key: ${privateKey}`);
    console.log(`   Address: ${account.address}`);
    console.log('⚠️  IMPORTANT: Save your private key securely!');
  }

  // Generate stealth keys if requested
  if (generateStealthKeys) {
    console.log('🔐 Generating stealth keys...');
    const keys = await generateStealthKeysFunction();
    spendingPublicKey = keys.spendingPublicKey;
    viewingPrivateKey = keys.viewingPrivateKey;
    console.log('✅ Stealth keys generated');
    console.log(`   Spending Public Key: ${spendingPublicKey}`);
    console.log(`   Viewing Private Key: ${viewingPrivateKey}`);
    console.log('⚠️  IMPORTANT: Save your viewing private key securely!');
  }

  // Validate required arguments
  if (!username) {
    console.error('❌ Error: --username is required (or use --generate-username)');
    console.log('Run with --help for usage information');
    process.exit(1);
  }

  if (!privateKey) {
    console.error('❌ Error: --private-key is required (or use --generate-key)');
    console.log('Run with --help for usage information');
    process.exit(1);
  }

  // Validate required stealth keys and zcash address
  if (!spendingPublicKey) {
    console.error('❌ Error: --spending-public-key is required (or use --generate-stealth-keys)');
    console.log('Run with --help for usage information');
    process.exit(1);
  }

  if (!viewingPrivateKey) {
    console.error('❌ Error: --viewing-private-key is required (or use --generate-stealth-keys)');
    console.log('Run with --help for usage information');
    process.exit(1);
  }

  // Use default Zcash address if not provided
  if (!zcashAddress) {
    zcashAddress = DEFAULT_ZCASH_ADDRESS;
    console.log(`💰 Using default Zcash address: ${zcashAddress}`);
  }

  // Register user
  const result = await registerUser({
    username,
    privateKey,
    zcashAddress,
    spendingPublicKey,
    viewingPrivateKey,
  });

  if (!result.success) {
    console.error(`❌ Registration failed: ${result.error}`);
    process.exit(1);
  }

  process.exit(0);
}

// Run CLI if executed directly
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

