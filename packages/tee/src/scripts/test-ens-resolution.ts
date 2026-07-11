// Test ENS Resolution using viem
// Tests if our off-chain resolver is working correctly

import { createPublicClient, http, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

// Test ENS name (should be registered in our system)
const TEST_ENS_NAME = process.argv[2] || 'bs14c4kz.assuranet.eth';

async function testEnsResolution() {
  console.log(`\n🧪 Testing ENS Resolution for: ${TEST_ENS_NAME}\n`);

  // Create public client for Ethereum mainnet
  // The resolver contract on mainnet will call our CCIP endpoint
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ETH_MAINNET_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY'),
  });

  try {
    // Normalize the ENS name
    const normalizedName = normalize(TEST_ENS_NAME);
    console.log(`✅ Normalized name: ${normalizedName}\n`);

    // Test 1: Get address (addr record)
    console.log('📋 Test 1: Resolving address (addr)...');
    try {
      const address = await client.getEnsAddress({
        name: normalizedName,
      });
      console.log(`   Result: ${address || 'null'}`);
      if (address && address !== '0x0000000000000000000000000000000000000000') {
        console.log(`   ✅ Successfully resolved to: ${address}`);
      } else {
        console.log(`   ⚠️  Resolved to zero address (might be expected if not registered)`);
      }
    } catch (error) {
      console.error(`   ❌ Error resolving address:`, error);
    }

    console.log('');

    // Test 2: Get text record
    console.log('📋 Test 2: Resolving text record (key: "url")...');
    try {
      const text = await client.getEnsText({
        name: normalizedName,
        key: 'url',
      });
      console.log(`   Result: ${text || 'null'}`);
      if (text) {
        console.log(`   ✅ Successfully resolved text record: ${text}`);
      } else {
        console.log(`   ⚠️  No text record found`);
      }
    } catch (error) {
      console.error(`   ❌ Error resolving text record:`, error);
    }

    console.log('');

    // Test 3: Get Zcash address (custom text record)
    console.log('📋 Test 3: Resolving Zcash address (key: "zcash")...');
    try {
      const zcashAddress = await client.getEnsText({
        name: normalizedName,
        key: 'zcash',
      });
      console.log(`   Result: ${zcashAddress || 'null'}`);
      if (zcashAddress) {
        console.log(`   ✅ Successfully resolved Zcash address: ${zcashAddress}`);
      } else {
        console.log(`   ⚠️  No Zcash address found`);
      }
    } catch (error) {
      console.error(`   ❌ Error resolving Zcash address:`, error);
    }

    console.log('');

    // Test 4: Get resolver address
    console.log('📋 Test 4: Getting resolver address...');
    try {
      const resolverAddress = await client.getEnsResolver({
        name: normalizedName,
      });
      console.log(`   Resolver: ${resolverAddress || 'null'}`);
      if (resolverAddress) {
        console.log(`   ✅ Resolver found: ${resolverAddress}`);
      } else {
        console.log(`   ⚠️  No resolver found`);
      }
    } catch (error) {
      console.error(`   ❌ Error getting resolver:`, error);
    }

    console.log('');

    // Test 5: Get all records (using multicall for efficiency)
    console.log('📋 Test 5: Getting multiple records...');
    try {
      const [addr, urlText, zcashText, resolver] = await Promise.all([
        client.getEnsAddress({ name: normalizedName }).catch(() => null),
        client.getEnsText({ name: normalizedName, key: 'url' }).catch(() => null),
        client.getEnsText({ name: normalizedName, key: 'zcash' }).catch(() => null),
        client.getEnsResolver({ name: normalizedName }).catch(() => null),
      ]);

      console.log(`   Address: ${addr || 'null'}`);
      console.log(`   URL: ${urlText || 'null'}`);
      console.log(`   Zcash: ${zcashText || 'null'}`);
      console.log(`   Resolver: ${resolver || 'null'}`);

      if (addr && addr !== '0x0000000000000000000000000000000000000000') {
        console.log(`   ✅ Address resolution working!`);
      }
      if (urlText) {
        console.log(`   ✅ Text record resolution working!`);
      }
      if (zcashText) {
        console.log(`   ✅ Zcash address resolution working!`);
      }
    } catch (error) {
      console.error(`   ❌ Error in batch resolution:`, error);
    }

    console.log('\n✨ Test complete!\n');
  } catch (error) {
    console.error('\n❌ Fatal error during testing:', error);
    process.exit(1);
  }
}

// Run the test
testEnsResolution().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

