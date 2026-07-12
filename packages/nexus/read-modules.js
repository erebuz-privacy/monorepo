#!/usr/bin/env node

const { ethers } = require('ethers');

// Configuration from deployments.json
const CONFIG = {
  networks: {
    arbitrumSepolia: {
      chainId: 421614,
      rpcUrl: 'https://arbitrum-sepolia.publicnode.com',
      modules: {
        autoEarn: '0x748Cb019ffF904482e8518124F2BbFF0Ea7Ec7d6',
        autoSwap: '0x537a0aB5A0172E69EC824cD1048A57eca95c696B',
        autoBridge: '0xDdAd6d1084fF9e8CaBf579358A95666Bf5515F51'
      }
    },
    baseSepolia: {
      chainId: 84532,
      rpcUrl: 'https://base-sepolia.publicnode.com',
      modules: {
        autoEarn: '0x6e1fAc6e36f01615ef0c0898Bf6c5F260Bf2609a',
        autoSwap: '0x564B1354Af4D3EA51eE3a9eFaD608E9aa78d3905',
        autoBridge: '0xe8Da54c7056680FF1b7FF6E9dfD0721dDcAd3F14'
      }
    }
  }
};

// Minimal ABI - just the function we need
const MINIMAL_ABI = [
  {
    "name": "getConfigInputTypeData",
    "type": "function",
    "stateMutability": "pure",
    "inputs": [],
    "outputs": [
      {
        "name": "configInputTypeData",
        "type": "string"
      }
    ]
  }
];

// Function to read ConfigInput type from a module
async function readConfigInputType(provider, moduleAddress, moduleName, chainName) {
  try {
    const contract = new ethers.Contract(moduleAddress, MINIMAL_ABI, provider);
    const configInputTypeData = await contract.getConfigInputTypeData();
    
    console.log(`✅ ${chainName} - ${moduleName}:`);
    console.log(`   Address: ${moduleAddress}`);
    console.log(`   ConfigInput Type: ${configInputTypeData}`);
    console.log('');
    
    return {
      chainName,
      moduleName,
      address: moduleAddress,
      configInputType: configInputTypeData
    };
  } catch (error) {
    console.error(`❌ ${chainName} - ${moduleName} (${moduleAddress}):`);
    console.error(`   Error: ${error.message}`);
    console.log('');
    return null;
  }
}

// Main function to read all modules
async function readAllModules() {
  console.log('🚀 Reading ConfigInput types from all deployed modules...\n');
  
  const results = [];
  
  for (const [chainName, networkConfig] of Object.entries(CONFIG.networks)) {
    console.log(`📡 Connecting to ${chainName} (Chain ID: ${networkConfig.chainId})`);
    
    // Create provider for this network
    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    
    // Test connection
    try {
      const network = await provider.getNetwork();
      console.log(`✅ Connected to ${network.name} (Chain ID: ${network.chainId})\n`);
    } catch (error) {
      console.error(`❌ Failed to connect to ${chainName}: ${error.message}\n`);
      continue;
    }
    
    // Read all modules for this network
    for (const [moduleName, moduleAddress] of Object.entries(networkConfig.modules)) {
      const result = await readConfigInputType(provider, moduleAddress, moduleName, chainName);
      if (result) {
        results.push(result);
      }
    }
  }
  
  // Summary
  console.log('📊 SUMMARY:');
  console.log('==========');
  console.log(`Total modules read: ${results.length}/6`);
  console.log(`Successful: ${results.filter(r => r).length}`);
  console.log(`Failed: ${results.filter(r => !r).length}`);
  
  if (results.length > 0) {
    console.log('\n📋 All ConfigInput Types:');
    console.log('========================');
    results.forEach(result => {
      console.log(`${result.chainName}.${result.moduleName}: ${result.configInputType}`);
    });
  }
  
  return results;
}

// Run if called directly
if (require.main === module) {
  readAllModules()
    .then(() => {
      console.log('\n✅ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

module.exports = {
  readAllModules,
  readConfigInputType,
  CONFIG,
  MINIMAL_ABI
};