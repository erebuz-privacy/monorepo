# Deploy Account with AutoEarn - Node.js Script

This Node.js script provides a simple and efficient way to deploy Nexus accounts with AutoEarn module using existing deployed contracts. It uses Multicall3 to atomically deploy the account and execute AutoEarn in a single transaction.

## 🚀 Features

- ✅ **Atomic Deployment**: Account deployment + AutoEarn execution in one transaction
- ✅ **Signature-based Authorization**: Uses ECDSA signatures for AutoEarn calls
- ✅ **Gas Efficient**: Uses Multicall3 for batching operations
- ✅ **Minimal Setup**: No need to redeploy core contracts
- ✅ **Error Handling**: Comprehensive error handling with fallback deployment
- ✅ **Account Tracking**: Saves deployed account data to JSON file

## 📋 Prerequisites

### 1. Environment Setup

Create a `.env` file in the project root:

```bash
# Private key for the relayer account (must have USDC balance)
PRIVATE_KEY=0x7cf73cff18de223ccfc1188c034f639768a90fd628393d0538fdb54d62b64695

# Network configuration
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

### 2. Deployed Contracts

Ensure you have a `deployments.json` file in the project root with the following structure:

```json
{
  "chainId": 84532,
  "coreContracts": {
    "nexusAccountFactory": "0x96Aeefc6dbCa7258C2A01329b6712ABAcD9295D9",
    "biconomyMetaFactory": "0xca4f4Ba8b4E0d56090Bbc36B9Ae2E7130EcFBf00",
    "nexusBootstrap": "0xbB9497609A3589a067e5Cd5A6Cc130648ad26281",
    "mockRegistry": "0xEc56b4B2932CFCa7Fe153c8A7479Db2d8fa9E2d1"
  },
  "modules": {
    "autoEarnModule": "0x4CC08b690200ec4250D479D5a539Bc8494FD8a18"
  },
  "configuration": {
    "usdcToken": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "aavePool": "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b"
  }
}
```

### 3. USDC Balance

Your relayer account must have at least 0.01 USDC for the deployment to work.

## 🛠️ Usage

### Basic Usage

```bash
# Run the deployment script
node scripts/hardhat/deployAccountWithAutoEarn.js
```

### With Custom Environment

```bash
# Set environment variables and run
PRIVATE_KEY=your_private_key BASE_SEPOLIA_RPC=your_rpc_url node scripts/hardhat/deployAccountWithAutoEarn.js
```

## 📖 How It Works

### 1. **Account Address Computation**

The script first computes the deterministic address for the new account:

```javascript
// Generate unique salt
const salt = ethers.keccak256(ethers.toUtf8Bytes("atomic-deployment-" + Date.now()));

// Calculate expected account address
const expectedAccount = await nexusAccountFactory.computeAccountAddress(initData, salt);
```

### 2. **USDC Pre-transfer**

Before deployment, the script transfers 0.01 USDC to the expected account address:

```javascript
const transferTx = await usdc.transfer(expectedAccount, TRANSFER_AMOUNT);
```

### 3. **Signature Creation**

Creates an ECDSA signature for the AutoEarn call:

```javascript
const packedData = ethers.solidityPacked(
    ["uint256", "address", "uint256", "address", "uint256"],
    [84532, USDC_ADDRESS, TRANSFER_AMOUNT, expectedAccount, nonce]
);
const hash = ethers.keccak256(packedData);
const signature = await wallet.signMessage(ethers.getBytes(hash));
```

### 4. **Atomic Multicall3 Execution**

Uses Multicall3 to execute both operations atomically:

```javascript
const calls = [
    {
        target: deployments.coreContracts.biconomyMetaFactory,
        allowFailure: false,
        callData: biconomyMetaFactory.interface.encodeFunctionData("deployWithFactory", [
            deployments.coreContracts.nexusAccountFactory,
            factoryCallData
        ])
    },
    {
        target: deployments.modules.autoEarnModule,
        allowFailure: false,
        callData: autoEarnModule.interface.encodeFunctionData("autoEarn", [
            USDC_ADDRESS,
            TRANSFER_AMOUNT,
            expectedAccount,
            nonce,
            signature
        ])
    }
];

const multicallTx = await multicall3.aggregate3(calls, { gasLimit: 2000000 });
```

## 🔧 Configuration

### AutoEarn Module Configuration

The script automatically configures the AutoEarn module with:

- **Chain ID**: 84532 (Base Sepolia)
- **Token**: USDC (0x036CbD53842c5426634e7929541eC2318f3dCF7e)
- **Vault**: Aave Pool (0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b)

### Account Configuration

Each deployed account includes:

- **Owner**: Same as the relayer (for simplicity)
- **Validators**: K1Validator (installed by default)
- **Executors**: AutoEarn module
- **Registry**: MockRegistry with owner as attester

## 📊 Output

### Console Output

```
=== Deploying Account with AutoEarn via Multicall3 ===
Relayer: 0xAF9fC206261DF20a7f2Be9B379B101FAFd983117
Owner: 0xAF9fC206261DF20a7f2Be9B379B101FAFd983117
Relayer USDC balance: 9.951094
Config Hash: 0x3fa13ed6637c80cee18db2d47aed35798785a2419cc79c0564ab70485f0124a7
Salt: 0x...
Expected Account Address: 0x...
Transferring 0.01 USDC to expected account...
USDC transferred successfully
Signature created

Debug: Testing individual calls...
Factory call would succeed

Executing Multicall3: deploy account + AutoEarn...
Transaction hash: 0x...
Multicall3 execution successful!
Account deployed and AutoEarn executed in single transaction!
Final USDC balance: 0.000000
AutoEarn module initialized: true
SUCCESS: Account deployment with AutoEarn completed!
Deployed Account: 0x...
Owner: 0x...
Relayer: 0x...
Account data saved to deployed-accounts.json
```

### Account Tracking

The script saves deployed account information to `deployed-accounts.json`:

```json
[
  {
    "account": "0x...",
    "owner": "0x...",
    "relayer": "0x...",
    "deployedAt": "2024-01-15T10:30:00.000Z",
    "txHash": "0x...",
    "salt": "0x..."
  }
]
```

## 🚨 Error Handling

### Fallback Deployment

If Multicall3 fails, the script automatically falls back to separate deployment:

```javascript
try {
    // Try Multicall3 first
    const multicallTx = await multicall3.aggregate3(calls);
} catch (error) {
    // Fallback to separate deployment
    const deployTx = await biconomyMetaFactory.deployWithFactory(...);
    const autoEarnTx = await autoEarnModule.autoEarn(...);
}
```

### Common Issues

1. **Insufficient USDC Balance**
   ```
   Error: Insufficient USDC balance
   ```
   **Solution**: Ensure your relayer account has at least 0.01 USDC

2. **Invalid Contract Addresses**
   ```
   Error: invalid address (argument="address", value=null)
   ```
   **Solution**: Check that `deployments.json` contains valid contract addresses

3. **Network Connection Issues**
   ```
   Error: network error
   ```
   **Solution**: Verify your RPC URL and network connectivity

## 🔍 Debugging

### Enable Debug Mode

The script includes built-in debugging features:

- Tests individual calls before Multicall3 execution
- Provides detailed error messages
- Shows gas usage and transaction hashes

### Manual Testing

You can test individual components:

```javascript
// Test account address computation
const expectedAccount = await nexusAccountFactory.computeAccountAddress(initData, salt);

// Test USDC transfer
const transferTx = await usdc.transfer(expectedAccount, TRANSFER_AMOUNT);

// Test signature creation
const signature = await wallet.signMessage(ethers.getBytes(hash));
```

## 📚 Technical Details

### Contract ABIs

The script uses minimal ABIs for efficiency:

```javascript
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

const MULTICALL3_ABI = [
    "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[] returnData)"
];
```

### Gas Optimization

- Uses explicit gas limits (2M for Multicall3)
- Batches operations in single transaction
- Pre-computes account addresses to avoid failed deployments

### Security Features

- ECDSA signature verification for AutoEarn calls
- Deterministic account address computation
- Atomic transaction execution (all-or-nothing)

## 🎯 Use Cases

1. **Development Testing**: Quickly deploy test accounts with AutoEarn
2. **User Onboarding**: Deploy accounts for new users with initial USDC deposit
3. **Batch Operations**: Deploy multiple accounts efficiently
4. **Integration Testing**: Test AutoEarn functionality with real deployments

## 🔄 Integration with Foundry

This Node.js script complements the Foundry deployment script:

- **Foundry**: Deploys core contracts and modules
- **Node.js**: Deploys individual accounts using existing contracts

Both scripts use the same `deployments.json` file for consistency.

## 📝 License

This script is part of the Nexus project and follows the same licensing terms.

---

**Note**: This script is designed for Base Sepolia testnet. For mainnet deployment, update the contract addresses and network configuration accordingly.
