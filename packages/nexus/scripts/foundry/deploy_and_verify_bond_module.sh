#!/bin/bash

# Deploy and Verify BondModule Escrow Test on Base Sepolia
# Usage: ./scripts/foundry/deploy_and_verify_bond_module.sh [ETHERSCAN_API_KEY]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}  BondModule Escrow Deployment & Verification${NC}"
echo -e "${BLUE}  Network: Base Sepolia${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""

# Check if PRIVATE_KEY is set
if [ -z "$PRIVATE_KEY" ]; then
    echo -e "${RED}Error: PRIVATE_KEY environment variable is not set${NC}"
    echo "Please set it with: export PRIVATE_KEY=your_private_key"
    exit 1
fi

# Get Etherscan API key from argument or environment variable
ETHERSCAN_API_KEY="${1:-$ETHERSCAN_API_KEY}"

if [ -z "$ETHERSCAN_API_KEY" ]; then
    echo -e "${YELLOW}Warning: No BaseScan API key provided${NC}"
    echo "Contracts will be deployed but not verified."
    echo ""
    echo -e "${BLUE}Note: Base Sepolia uses BaseScan (NOT Etherscan!)${NC}"
    echo "Get your API key from: https://basescan.org/myapikey"
    echo ""
    echo "To verify, either:"
    echo "  1. Pass API key as argument: ./deploy_and_verify_bond_module.sh YOUR_API_KEY"
    echo "  2. Set environment variable: export ETHERSCAN_API_KEY=YOUR_API_KEY"
    echo ""
    read -p "Continue without verification? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    VERIFY_FLAG=""
else
    echo -e "${GREEN}BaseScan API Key found: ${ETHERSCAN_API_KEY:0:8}...${NC}"
    VERIFY_FLAG="--verify --etherscan-api-key $ETHERSCAN_API_KEY"
fi

# Base Sepolia RPC URL
RPC_URL="https://sepolia.base.org"

echo -e "${BLUE}Step 1: Compiling contracts...${NC}"
forge build

if [ $? -ne 0 ]; then
    echo -e "${RED}Compilation failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Compilation successful!${NC}"
echo ""

echo -e "${BLUE}Step 2: Deploying contracts to Base Sepolia...${NC}"
echo "RPC URL: $RPC_URL"
echo ""

# Deploy with or without verification
if [ -z "$VERIFY_FLAG" ]; then
    # Deploy without verification
    forge script scripts/foundry/DeployBondModuleEscrow_BaseSepolia.s.sol:DeployBondModuleEscrow_BaseSepolia \
        --rpc-url $RPC_URL \
        --broadcast \
        -vvvv
else
    # Deploy with verification
    forge script scripts/foundry/DeployBondModuleEscrow_BaseSepolia.s.sol:DeployBondModuleEscrow_BaseSepolia \
        --rpc-url $RPC_URL \
        --broadcast \
        $VERIFY_FLAG \
        -vvvv
fi

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}=================================================${NC}"
    echo -e "${GREEN}  Deployment Successful!${NC}"
    echo -e "${GREEN}=================================================${NC}"
    echo ""
    echo "Check the output above for:"
    echo "  - Contract addresses"
    echo "  - Transaction hashes"
    echo "  - Distribution summary"
    echo "  - Verification commands (if not auto-verified)"
    echo ""
    echo "View transactions on Base Sepolia BaseScan:"
    echo "  https://sepolia.basescan.org/"
    echo ""
    echo -e "${BLUE}Note: Verification may take 1-2 minutes to appear on BaseScan${NC}"
    echo ""
else
    echo -e "${RED}Deployment failed!${NC}"
    exit 1
fi
