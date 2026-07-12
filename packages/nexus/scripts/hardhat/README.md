# Hardhat Deployment Scripts

## Deploy Account with AutoEarn

This script deploys a new Nexus account with AutoEarn module using existing deployed contracts.

### Prerequisites

1. Set up your environment variables in `.env`:
```bash
PRIVATE_KEY=your_private_key_here
HH_RPC_URL=https://sepolia.base.org
HH_CHAIN_NAME=baseSepolia
HH_CHAIN_ID=84532
```

2. Make sure you have the `deployments.json` file in the project root with the deployed contract addresses.

### Usage

```bash
# Run the deployment script
npx hardhat run scripts/hardhat/deployAccountWithAutoEarn.js --network baseSepolia
```

### What it does

1. **Uses existing contracts**: Reads deployed contract addresses from `deployments.json`
2. **Generates random owner**: Creates a random wallet as the account owner
3. **Computes account address**: Calculates the deterministic address for the new account
4. **Transfers USDC**: Sends 0.01 USDC to the expected account address
5. **Atomic deployment**: Uses Multicall3 to deploy the account and execute AutoEarn in a single transaction

### Features

- ✅ **Minimal setup**: No need to redeploy core contracts
- ✅ **Atomic execution**: Account deployment + AutoEarn in one transaction
- ✅ **Signature-based**: Uses ECDSA signatures for AutoEarn authorization
- ✅ **Gas efficient**: Uses Multicall3 for batching operations
- ✅ **Random ownership**: Each deployment uses a different random owner

### Output

The script will output:
- Relayer address (your account)
- Random owner address
- Expected account address
- Transaction hashes
- Final balances and verification results
