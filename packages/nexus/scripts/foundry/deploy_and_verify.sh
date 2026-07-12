#!/bin/bash

# Deploy and Verify Nexus with AutoEarn Module on Base Sepolia
# This script deploys all contracts and then verifies them on BaseScan

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Check if .env file exists and source it
if [ -f .env ]; then
    print_status "Loading environment variables from .env file..."
    source .env
else
    print_error ".env file not found. Please create one with your API keys."
    exit 1
fi

# Check if required environment variables are set
if [ -z "$PRIVATE_KEY" ]; then
    print_error "PRIVATE_KEY not set in .env file"
    exit 1
fi

if [ -z "$API_KEY_ARBISCAN" ]; then
    print_error "API_KEY_ARBISCAN not set in .env file"
    exit 1
fi

# Network configuration
RPC_URL="https://sepolia.base.org"
CHAIN_ID="base-sepolia"

print_status "Starting deployment and verification process..."
print_status "Network: Base Sepolia"
print_status "RPC URL: $RPC_URL"

# Step 1: Deploy contracts
print_status "Step 1: Deploying contracts..."
forge script scripts/foundry/DeployNexusWithAutoEarn_PrivateKey.s.sol:DeployNexusWithAutoEarn_PrivateKey \
    --rpc-url $RPC_URL \
    --broadcast \
    --via-ir \
    -vvvv

if [ $? -eq 0 ]; then
    print_success "Deployment completed successfully!"
else
    print_error "Deployment failed!"
    exit 1
fi

# Step 2: Verify contracts
print_status "Step 2: Verifying contracts on BaseScan..."

# Contract addresses from the deployment (these will be updated after each deployment)
NEXUS_IMPL="0xC5Ea2B4b19176B77792a3a63A1071A9e7916AB4e"
K1_VALIDATOR="0x37e5608f8Ef811FAd35133F12a441C118e60914A"
NEXUS_BOOTSTRAP="0xBb4065EBA07C375dcc2782D62520A36d562Af8C0"
NEXUS_FACTORY="0x3B69c47C59F73D67c737C3D1668Ca9356D918Be0"
BICONOMY_FACTORY="0x4137EA30080F4FB042Bd3c5DA22cF8bbDaF805C4"
MOCK_REGISTRY="0xBa4F1ecD158bcE0095615D79763CF4C56fc93417"
AUTO_EARN="0x83d535A3d58bB004c27ccefDC9c508466d0CBdAf"
PAYMASTER="0x0000000000000000000000000000000000000000" # update after deployment

# Try to load PAYMASTER from deployments.json if present
if [ -f deployments.json ]; then
    if command -v jq >/dev/null 2>&1; then
        LOADED_PM=$(jq -r '.paymaster // empty' deployments.json)
        if [ -n "$LOADED_PM" ] && [ "$LOADED_PM" != "null" ]; then
            PAYMASTER=$LOADED_PM
            print_status "Loaded Paymaster from deployments.json: $PAYMASTER"
        else
            print_warning "No paymaster field found in deployments.json; using placeholder"
        fi
    else
        print_warning "jq not installed; cannot auto-load Paymaster from deployments.json"
    fi
else
    print_warning "deployments.json not found; using placeholder Paymaster address"
fi

# Function to verify a contract
verify_contract() {
    local contract_address=$1
    local contract_path=$2
    local contract_name=$3
    
    print_status "Verifying $contract_name at $contract_address..."
    
    if forge verify-contract $contract_address $contract_path --chain $CHAIN_ID --etherscan-api-key $API_KEY_ARBISCAN --watch; then
        print_success "$contract_name verified successfully!"
        return 0
    else
        print_warning "$contract_name verification failed or already verified"
        return 1
    fi
}

# Verify all contracts
verify_contract $NEXUS_IMPL "contracts/Nexus.sol:Nexus" "Nexus Implementation"
verify_contract $K1_VALIDATOR "contracts/modules/validators/K1Validator.sol:K1Validator" "K1Validator"
verify_contract $NEXUS_BOOTSTRAP "contracts/utils/NexusBootstrap.sol:NexusBootstrap" "NexusBootstrap"
verify_contract $NEXUS_FACTORY "contracts/factory/NexusAccountFactory.sol:NexusAccountFactory" "NexusAccountFactory"
verify_contract $BICONOMY_FACTORY "contracts/factory/BiconomyMetaFactory.sol:BiconomyMetaFactory" "BiconomyMetaFactory"
verify_contract $MOCK_REGISTRY "contracts/mocks/MockRegistry.sol:MockRegistry" "MockRegistry"
verify_contract $AUTO_EARN "contracts/modules/executors/AutoEarn.sol:AutoEarn" "AutoEarn Module"
verify_contract $PAYMASTER "contracts/mocks/MockPaymaster.sol:MockPaymaster" "MockPaymaster"

print_success "Deployment and verification process completed!"
print_status "You can view your contracts on BaseScan:"
print_status "  Nexus Implementation: https://sepolia.basescan.org/address/$NEXUS_IMPL"
print_status "  K1Validator: https://sepolia.basescan.org/address/$K1_VALIDATOR"
print_status "  NexusBootstrap: https://sepolia.basescan.org/address/$NEXUS_BOOTSTRAP"
print_status "  NexusAccountFactory: https://sepolia.basescan.org/address/$NEXUS_FACTORY"
print_status "  BiconomyMetaFactory: https://sepolia.basescan.org/address/$BICONOMY_FACTORY"
print_status "  MockRegistry: https://sepolia.basescan.org/address/$MOCK_REGISTRY"
print_status "  AutoEarn Module: https://sepolia.basescan.org/address/$AUTO_EARN"
print_status "  MockPaymaster: https://sepolia.basescan.org/address/$PAYMASTER"
