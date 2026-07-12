#!/bin/bash

# Biconomy Nexus Base Sepolia Deployment Script
# This script deploys the complete Biconomy Nexus stack with all modules to Base Sepolia

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

# Check if API key is set (optional)
if [ -z "$BASESCAN_API_KEY" ]; then
    print_warning "BASESCAN_API_KEY not set. Contracts will not be verified on Base."
fi

print_header "🚀 Starting Biconomy Nexus Deployment to Base Sepolia"
print_status "Deployer Address: $(cast wallet address --private-key $PRIVATE_KEY)"
print_status "Network: Base Sepolia (Chain ID: 84532)"
print_status "Modules: AutoEarn + AutoSwap + AutoBridge"

# Create necessary directories
mkdir -p deployments
mkdir -p broadcast/DeployBaseSepoliaOnly.s.sol/84532

print_header "📋 Deployment Configuration"
echo "=================="
echo "✅ Base Sepolia (Chain ID: 84532)"
echo "  - AutoEarn Module (Aave V3)"
echo "  - AutoSwap Module (Uniswap V3)"
echo "  - AutoBridge Module (Across Protocol)"
echo ""

print_header "🔧 Pre-deployment Checks"
echo "=================="

# Check network connectivity
print_status "Checking network connectivity..."

# Test Base Sepolia RPC
if curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' https://base-sepolia.publicnode.com | grep -q "0x14a34"; then
    print_success "Base Sepolia RPC: Connected ✅"
else
    print_error "Base Sepolia RPC: Failed ❌"
    exit 1
fi

print_header "🚀 Deploying to Base Sepolia"
echo "=================="

# Deploy to Base Sepolia
print_module "Deploying to Base Sepolia..."
if forge script scripts/foundry/DeployBaseSepoliaOnly.s.sol:DeployBaseSepoliaOnly \
    --rpc-url https://base-sepolia.publicnode.com \
    --broadcast \
    --verify \
    --etherscan-api-key ${BASESCAN_API_KEY:-""} \
    --slow; then
    print_success "Base Sepolia deployment completed! ✅"
else
    print_error "Base Sepolia deployment failed! ❌"
    exit 1
fi

print_header "📊 Deployment Summary"
echo "=================="

# Display deployment summary
if [ -f "deployments.json" ]; then
    print_success "Deployment completed successfully! 🎉"
    echo ""
    
    print_status "📋 Deployment Results:"
    echo "=================="
    
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
    echo "  - deployments.json (Complete deployment data)"
    echo "  - broadcast/DeployBaseSepoliaOnly.s.sol/ (Transaction logs)"
    echo ""
    
    print_status "🔗 External Integrations:"
    echo "=================="
    echo "✅ Aave V3 (AutoEarn Module)"
    echo "  - Base Sepolia: Pool $(jq -r '.baseSepolia.configuration.aavePool' deployments.json)"
    echo ""
    echo "✅ Uniswap V3 (AutoSwap Module)"
    echo "  - Base Sepolia: Router $(jq -r '.baseSepolia.configuration.uniswapRouter' deployments.json)"
    echo ""
    echo "✅ Across Protocol (AutoBridge Module)"
    echo "  - Base Sepolia: SpokePool $(jq -r '.baseSepolia.configuration.acrossSpokePool' deployments.json)"
    echo ""
    
    print_header "🎯 Next Steps"
    echo "=================="
    echo "1. ✅ Smart account is deployed with all modules pre-installed"
    echo "2. ✅ AutoEarn module is configured for Aave V3 integration"
    echo "3. ✅ AutoSwap module is configured for Uniswap V3 integration"
    echo "4. ✅ AutoBridge module is configured for Across Protocol integration"
    echo "5. 🔄 Test module functionality on Base Sepolia"
    echo "6. 🔄 Integrate with your frontend application"
    echo ""
    
    print_success "🚀 Biconomy Nexus Stack Deployment Successful!"
    print_status "You now have a fully functional smart account with AutoEarn, AutoSwap, and AutoBridge modules on Base Sepolia!"
    
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
echo "🔍 Block Explorer:"
echo "  - Base Sepolia: https://sepolia.basescan.org"
echo ""
echo "💬 Community:"
echo "  - Biconomy Discord: https://discord.gg/biconomy"
echo "  - Aave Discord: https://discord.gg/aave"
echo "  - Uniswap Discord: https://discord.gg/uniswap"
echo "  - Across Discord: https://discord.gg/across"
