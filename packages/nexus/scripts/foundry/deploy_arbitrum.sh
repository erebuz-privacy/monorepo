#!/bin/bash

# Biconomy Nexus Arbitrum Sepolia Deployment Script
# This script deploys the complete Biconomy Nexus stack with all modules to Arbitrum Sepolia

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
if [ -z "$ARBISCAN_API_KEY" ]; then
    print_warning "ARBISCAN_API_KEY not set. Contracts will not be verified on Arbitrum."
fi

print_header "🚀 Starting Biconomy Nexus Deployment to Arbitrum Sepolia"
print_status "Deployer Address: $(cast wallet address --private-key $PRIVATE_KEY)"
print_status "Network: Arbitrum Sepolia (Chain ID: 421614)"
print_status "Modules: AutoEarn + Swap + Bridge"

# Create necessary directories
mkdir -p deployments
mkdir -p broadcast/DeployArbitrumOnly.s.sol/421614

print_header "📋 Deployment Configuration"
echo "=================="
echo "✅ Arbitrum Sepolia (Chain ID: 421614)"
echo "  - AutoEarn Module (Aave V3)"
echo "  - Swap Module (Uniswap V3)"
echo "  - Bridge Module (Across Protocol)"
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

print_header "🚀 Deploying to Arbitrum Sepolia"
echo "=================="

# Deploy to Arbitrum Sepolia
print_module "Deploying to Arbitrum Sepolia..."
if forge script scripts/foundry/DeployArbitrumOnly.s.sol:DeployArbitrumOnly \
    --rpc-url https://arbitrum-sepolia.publicnode.com \
    --broadcast \
    --verify \
    --etherscan-api-key ${ARBISCAN_API_KEY:-""} \
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
    print_success "Deployment completed successfully! 🎉"
    echo ""
    
    print_status "📋 Deployment Results:"
    echo "=================="
    
    # Arbitrum Sepolia results
    if jq -e '.arbitrumSepolia' deployments.json > /dev/null 2>&1; then
        print_module "Arbitrum Sepolia:"
        echo "  Chain ID: 421614"
        echo "  Deployed Account: $(jq -r '.arbitrumSepolia.deployedAccount' deployments.json)"
        echo "  AutoEarn Module: $(jq -r '.arbitrumSepolia.modules.autoEarnModule' deployments.json)"
        echo "  Swap Module: $(jq -r '.arbitrumSepolia.modules.swapModule' deployments.json)"
        echo "  Bridge Module: $(jq -r '.arbitrumSepolia.modules.bridgeModule' deployments.json)"
        echo ""
    fi
    
    print_status "📁 Generated Files:"
    echo "  - deployments.json (Complete deployment data)"
    echo "  - broadcast/DeployArbitrumOnly.s.sol/ (Transaction logs)"
    echo ""
    
    print_status "🔗 External Integrations:"
    echo "=================="
    echo "✅ Aave V3 (AutoEarn Module)"
    echo "  - Arbitrum Sepolia: Pool $(jq -r '.arbitrumSepolia.configuration.aavePool' deployments.json)"
    echo ""
    echo "✅ Uniswap V3 (Swap Module)"
    echo "  - Arbitrum Sepolia: Router $(jq -r '.arbitrumSepolia.configuration.uniswapRouter' deployments.json)"
    echo ""
    echo "✅ Across Protocol (Bridge Module)"
    echo "  - Arbitrum Sepolia: SpokePool $(jq -r '.arbitrumSepolia.configuration.acrossSpokePool' deployments.json)"
    echo ""
    
    print_header "🎯 Next Steps"
    echo "=================="
    echo "1. ✅ Smart account is deployed with all modules pre-installed"
    echo "2. ✅ AutoEarn module is configured for Aave V3 integration"
    echo "3. ✅ Swap module is configured for Uniswap V3 integration"
    echo "4. ✅ Bridge module is configured for Across Protocol integration"
    echo "5. 🔄 Test module functionality on Arbitrum Sepolia"
    echo "6. 🔄 Integrate with your frontend application"
    echo ""
    
    print_success "🚀 Biconomy Nexus Stack Deployment Successful!"
    print_status "You now have a fully functional smart account with AutoEarn, Swap, and Bridge modules on Arbitrum Sepolia!"
    
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
echo "  - Arbitrum Sepolia: https://sepolia.arbiscan.io"
echo ""
echo "💬 Community:"
echo "  - Biconomy Discord: https://discord.gg/biconomy"
echo "  - Aave Discord: https://discord.gg/aave"
echo "  - Uniswap Discord: https://discord.gg/uniswap"
echo "  - Across Discord: https://discord.gg/across"
