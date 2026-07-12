#!/bin/bash

# Biconomy Nexus Multi-Network Deployment Script
# This script deploys the complete Biconomy Nexus stack to both Arbitrum Sepolia and Base Sepolia

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${PURPLE}[HEADER]${NC} $1"
}

print_module() {
    echo -e "${CYAN}[MODULE]${NC} $1"
}

# Check if PRIVATE_KEY is set
if [ -z "$PRIVATE_KEY" ]; then
    print_error "PRIVATE_KEY environment variable is not set!"
    print_status "Please set your private key: export PRIVATE_KEY=your_private_key_here"
    exit 1
fi

print_header "🚀 Starting Biconomy Nexus Multi-Network Deployment"
print_status "Deployer Address: $(cast wallet address --private-key $PRIVATE_KEY)"
print_status "Networks: Arbitrum Sepolia + Base Sepolia"
print_status "Modules: AutoEarn + AutoSwap + AutoBridge"

# Create necessary directories
mkdir -p deployments
mkdir -p broadcast/DeployArbitrumOnly.s.sol/421614
mkdir -p broadcast/DeployBaseSepoliaOnly.s.sol/84532

print_header "📋 Deployment Configuration"
echo "=================="
echo "✅ Arbitrum Sepolia (Chain ID: 421614)"
echo "  - AutoEarn Module (Aave V3)"
echo "  - AutoSwap Module (Uniswap V3)"
echo "  - AutoBridge Module (Across Protocol)"
echo ""
echo "✅ Base Sepolia (Chain ID: 84532)"
echo "  - AutoEarn Module (Aave V3)"
echo "  - AutoSwap Module (Uniswap V3)"
echo "  - AutoBridge Module (Across Protocol)"
echo ""

print_header "🔧 Pre-deployment Checks"
echo "=================="

# Check network connectivity
print_status "Checking network connectivity..."

# Test Arbitrum Sepolia RPC
if curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' https://arbitrum-sepolia.publicnode.com | grep -q "0x66eee"; then
    print_success "Arbitrum Sepolia RPC: Connected ✅"
else
    print_error "Arbitrum Sepolia RPC: Failed ❌"
    exit 1
fi

# Test Base Sepolia RPC
if curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' https://base-sepolia.publicnode.com | grep -q "0x14a34"; then
    print_success "Base Sepolia RPC: Connected ✅"
else
    print_error "Base Sepolia RPC: Failed ❌"
    exit 1
fi

print_header "🚀 Deploying to Both Networks"
echo "=================="


# Deploy to Base Sepolia
print_module "Deploying to Base Sepolia..."

# Get current gas price for Base Sepolia
BASE_GAS_PRICE=$(cast gas-price --rpc-url https://base-sepolia.publicnode.com)
print_status "Base Sepolia current gas price: ${BASE_GAS_PRICE} gwei"

if forge script scripts/foundry/DeployBaseSepoliaOnly.s.sol:DeployBaseSepoliaOnly \
    --rpc-url https://base-sepolia.publicnode.com \
    --broadcast \
    --verify \
    --etherscan-api-key ${BASESCAN_API_KEY:-""} \
    --gas-price ${BASE_GAS_PRICE} \
    --slow; then
    print_success "Base Sepolia deployment completed! ✅"
else
    print_error "Base Sepolia deployment failed! ❌"
    exit 1
fi


# Deploy to Arbitrum Sepolia
print_module "Deploying to Arbitrum Sepolia..."

# Get current gas price for Arbitrum Sepolia
ARB_GAS_PRICE=$(cast gas-price --rpc-url https://arbitrum-sepolia.publicnode.com)
print_status "Arbitrum Sepolia current gas price: ${ARB_GAS_PRICE} gwei"

if forge script scripts/foundry/DeployArbitrumOnly.s.sol:DeployArbitrumOnly \
    --rpc-url https://arbitrum-sepolia.publicnode.com \
    --broadcast \
    --verify \
    --etherscan-api-key ${ARBISCAN_API_KEY:-""} \
    --gas-price ${ARB_GAS_PRICE} \
    --slow; then
    print_success "Arbitrum Sepolia deployment completed! ✅"
else
    print_error "Arbitrum Sepolia deployment failed! ❌"
    exit 1
fi

print_header "📊 Deployment Summary"
echo "=================="

# Display deployment summary
if [ -f "deployments.json" ]; then
    print_success "Both deployments completed successfully! 🎉"
    echo ""
    
    print_status "📋 Deployment Results:"
    echo "=================="
    
    # Arbitrum Sepolia results
    if jq -e '.arbitrumSepolia' deployments.json > /dev/null 2>&1; then
        print_module "Arbitrum Sepolia:"
        echo "  Chain ID: 421614"
        echo "  Deployed Account: $(jq -r '.arbitrumSepolia.deployedAccount' deployments.json)"
        echo "  AutoEarn Module: $(jq -r '.arbitrumSepolia.modules.autoEarnModule' deployments.json)"
        echo "  AutoSwap Module: $(jq -r '.arbitrumSepolia.modules.swapModule' deployments.json)"
        echo "  AutoBridge Module: $(jq -r '.arbitrumSepolia.modules.bridgeModule' deployments.json)"
        echo ""
    fi
    
    # Base Sepolia results
    if jq -e '.baseSepolia' deployments.json > /dev/null 2>&1; then
        print_module "Base Sepolia:"
        echo "  Chain ID: 84532"
        echo "  Deployed Account: $(jq -r '.baseSepolia.deployedAccount' deployments.json)"
        echo "  AutoEarn Module: $(jq -r '.baseSepolia.modules.autoEarnModule' deployments.json)"
        echo "  AutoSwap Module: $(jq -r '.baseSepolia.modules.autoSwapModule' deployments.json)"
        echo "  AutoBridge Module: $(jq -r '.baseSepolia.modules.autoBridgeModule' deployments.json)"
        echo ""
    fi
    
    print_status "📁 Generated Files:"
    echo "  - deployments.json (Complete deployment data for both networks)"
    echo "  - broadcast/DeployArbitrumOnly.s.sol/ (Arbitrum transaction logs)"
    echo "  - broadcast/DeployBaseSepoliaOnly.s.sol/ (Base transaction logs)"
    echo ""
    
    print_status "🔗 External Integrations:"
    echo "=================="
    echo "✅ Aave V3 (AutoEarn Module)"
    echo "  - Arbitrum Sepolia: Pool $(jq -r '.arbitrumSepolia.configuration.aavePool' deployments.json)"
    echo "  - Base Sepolia: Pool $(jq -r '.baseSepolia.configuration.aavePool' deployments.json)"
    echo ""
    echo "✅ Uniswap V3 (AutoSwap Module)"
    echo "  - Arbitrum Sepolia: Router $(jq -r '.arbitrumSepolia.configuration.uniswapRouter' deployments.json)"
    echo "  - Base Sepolia: Router $(jq -r '.baseSepolia.configuration.uniswapRouter' deployments.json)"
    echo ""
    echo "✅ Across Protocol (AutoBridge Module)"
    echo "  - Arbitrum Sepolia: SpokePool $(jq -r '.arbitrumSepolia.configuration.acrossSpokePool' deployments.json)"
    echo "  - Base Sepolia: SpokePool $(jq -r '.baseSepolia.configuration.acrossSpokePool' deployments.json)"
    echo ""
    
    print_header "🎯 Next Steps"
    echo "=================="
    echo "1. ✅ Smart accounts deployed with all modules pre-installed on both networks"
    echo "2. ✅ AutoEarn modules configured for Aave V3 integration"
    echo "3. ✅ AutoSwap modules configured for Uniswap V3 integration"
    echo "4. ✅ AutoBridge modules configured for cross-chain bridging"
    echo "5. 🔄 Test module functionality on both networks"
    echo "6. 🔄 Integrate with your frontend application"
    echo "7. 🔄 Test cross-chain operations between Arbitrum and Base"
    echo ""
    
    print_success "🚀 Biconomy Nexus Multi-Network Deployment Successful!"
    print_status "You now have fully functional smart accounts with all modules on both Arbitrum Sepolia and Base Sepolia!"
    
else
    print_error "deployments.json not found. Deployment may have failed."
    exit 1
fi

print_header "📞 Support & Resources"
echo "=================="
echo "📚 Documentation:"
echo "  - Biconomy Nexus: https://docs.biconomy.io"
echo "  - Aave V3: https://docs.aave.com"
echo "  - Uniswap V3: https://docs.uniswap.org"
echo "  - Across Protocol: https://docs.across.to"
echo ""
echo "🔍 Block Explorers:"
echo "  - Arbitrum Sepolia: https://sepolia.arbiscan.io"
echo "  - Base Sepolia: https://sepolia.basescan.org"
echo ""
echo "💬 Community:"
echo "  - Biconomy Discord: https://discord.gg/biconomy"
echo "  - Aave Discord: https://discord.gg/aave"
echo "  - Uniswap Discord: https://discord.gg/uniswap"
echo "  - Across Discord: https://discord.gg/across"
