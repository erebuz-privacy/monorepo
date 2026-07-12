#!/bin/bash

# Verify already deployed BondModule contracts on Base Sepolia
# Usage: ./scripts/foundry/verify_bond_module.sh [ETHERSCAN_API_KEY]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}  BondModule Contract Verification${NC}"
echo -e "${BLUE}  Network: Base Sepolia${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""

# Get Etherscan API key from argument or environment variable
ETHERSCAN_API_KEY="${1:-$ETHERSCAN_API_KEY}"

if [ -z "$ETHERSCAN_API_KEY" ]; then
    echo -e "${RED}Error: No BaseScan API key provided${NC}"
    echo ""
    echo -e "${BLUE}Important: Base Sepolia uses BaseScan (NOT Etherscan!)${NC}"
    echo ""
    echo "Usage:"
    echo "  1. Pass API key as argument: ./verify_bond_module.sh YOUR_API_KEY"
    echo "  2. Set environment variable: export ETHERSCAN_API_KEY=YOUR_API_KEY && ./verify_bond_module.sh"
    echo ""
    echo "Get your BaseScan API key from: https://basescan.org/myapikey"
    echo "Block explorer: https://sepolia.basescan.org/"
    exit 1
fi

echo -e "${GREEN}BaseScan API Key found: ${ETHERSCAN_API_KEY:0:8}...${NC}"
echo ""

# Deployed contract addresses (from your deployment)
MOCK_TOKEN="0x0Ec07fbE81f29D36aFDE2D9577aE781a2D16eeB2"
BOND_MODULE="0xb684eD9fD4e2172dF7f050f097E5F02cd6699681"
ZYFAI_VAULT="0x218BD9bd6c1A21E8F1e1b86D00534Be0De43C80A"
GIZA_VAULT="0x01F680b17e6AcF6C736bA2201b89ec4ae95888e9"
COD3X_VAULT="0x69026b4770A5a75e1Dd576A6462468214537dCa6"
DEPLOYER="0xAF9fC206261DF20a7f2Be9B379B101FAFd983117"

echo "Contract addresses to verify:"
echo "  Mock Token:  $MOCK_TOKEN"
echo "  BondModule:  $BOND_MODULE"
echo "  ZyFAI Vault: $ZYFAI_VAULT"
echo "  Giza Vault:  $GIZA_VAULT"
echo "  Cod3x Vault: $COD3X_VAULT"
echo ""
read -p "Proceed with verification? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi
echo ""

# Verify MockERC20
echo -e "${BLUE}[1/5] Verifying MockERC20...${NC}"
forge verify-contract \
    $MOCK_TOKEN \
    scripts/foundry/DeployBondModuleEscrow_BaseSepolia_Verified.s.sol:MockERC20 \
    --chain base-sepolia \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --constructor-args $(cast abi-encode "constructor(string,string,uint8)" "Test USDC" "USDC" 6) \
    --watch || echo -e "${YELLOW}MockERC20 verification failed or already verified${NC}"

echo ""
sleep 2

# Verify BondModule
echo -e "${BLUE}[2/5] Verifying BondModule...${NC}"
forge verify-contract \
    $BOND_MODULE \
    contracts/modules/executors/BondModule.sol:BondModule \
    --chain base-sepolia \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --constructor-args $(cast abi-encode "constructor(address,address)" $DEPLOYER $DEPLOYER) \
    --watch || echo -e "${YELLOW}BondModule verification failed or already verified${NC}"

echo ""
sleep 2

# Verify ZyFAI Vault
echo -e "${BLUE}[3/5] Verifying ZyFAI Vault...${NC}"
forge verify-contract \
    $ZYFAI_VAULT \
    test/foundry/mocks/MockEscrowVault.sol:MockEscrowVault \
    --chain base-sepolia \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --constructor-args $(cast abi-encode "constructor(string,address)" "ZyFAI Vault" $MOCK_TOKEN) \
    --watch || echo -e "${YELLOW}ZyFAI Vault verification failed or already verified${NC}"

echo ""
sleep 2

# Verify Giza Vault
echo -e "${BLUE}[4/5] Verifying Giza Vault...${NC}"
forge verify-contract \
    $GIZA_VAULT \
    test/foundry/mocks/MockEscrowVault.sol:MockEscrowVault \
    --chain base-sepolia \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --constructor-args $(cast abi-encode "constructor(string,address)" "Giza Vault" $MOCK_TOKEN) \
    --watch || echo -e "${YELLOW}Giza Vault verification failed or already verified${NC}"

echo ""
sleep 2

# Verify Cod3x Vault
echo -e "${BLUE}[5/5] Verifying Cod3x Vault...${NC}"
forge verify-contract \
    $COD3X_VAULT \
    test/foundry/mocks/MockEscrowVault.sol:MockEscrowVault \
    --chain base-sepolia \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --constructor-args $(cast abi-encode "constructor(string,address)" "Cod3x Vault" $MOCK_TOKEN) \
    --watch || echo -e "${YELLOW}Cod3x Vault verification failed or already verified${NC}"

echo ""
echo -e "${GREEN}=================================================${NC}"
echo -e "${GREEN}  Verification Process Completed!${NC}"
echo -e "${GREEN}=================================================${NC}"
echo ""
echo "Check verification status on Base Sepolia BaseScan:"
echo "  Mock Token:  https://sepolia.basescan.org/address/$MOCK_TOKEN#code"
echo "  BondModule:  https://sepolia.basescan.org/address/$BOND_MODULE#code"
echo "  ZyFAI Vault: https://sepolia.basescan.org/address/$ZYFAI_VAULT#code"
echo "  Giza Vault:  https://sepolia.basescan.org/address/$GIZA_VAULT#code"
echo "  Cod3x Vault: https://sepolia.basescan.org/address/$COD3X_VAULT#code"
echo ""
echo "Note: Verification can take 1-2 minutes to appear on BaseScan"
echo ""
