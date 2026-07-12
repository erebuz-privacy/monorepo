# Deploy Account with AutoEarn and Withdrawal Flow - Complete User Journey

This enhanced Node.js script demonstrates the complete user journey for a Nexus account with AutoEarn module, including deployment, deposit, and withdrawal functionality. It showcases how users can interact with their accounts using their private keys while relayers handle gas fees.

## 🚀 Complete Flow Overview

1. **Create Random User** - Generate a random private key for a new user
2. **Deploy Account** - Deploy Nexus account with AutoEarn module
3. **Deposit & Earn** - Transfer USDC and automatically deposit into Aave
4. **User Signs Withdrawal** - User signs a UserOp for withdrawal using their private key
5. **Relayer Executes** - Relayer pays gas and executes the withdrawal + transfer

## 🎯 Key Features

- ✅ **Random User Generation** - Creates a new user with random private key
- ✅ **Account Deployment** - Deploys Nexus account with AutoEarn module
- ✅ **Automatic Earning** - Deposits USDC into Aave for earning
- ✅ **User-Controlled Withdrawal** - User signs withdrawal with their private key
- ✅ **Relayer Gas Sponsorship** - Relayer pays all gas fees
- ✅ **Atomic Operations** - Uses Multicall3 for batching operations
- ✅ **Complete User Journey** - End-to-end flow demonstration

## 📋 Prerequisites

### 1. Environment Setup

Create a `.env` file in the project root:

```bash
# Private key for the relayer account (must have USDC balance and ETH for gas)
PRIVATE_KEY=0x7cf73cff18de223ccfc1188c034f639768a90fd628393d0538fdb54d62b64695

# Network configuration
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

### 2. Deployed Contracts

Ensure you have a `deployments.json` file with the following structure:

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
    "aavePool": "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b",
    "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
  }
}
```

### 3. Relayer Requirements

Your relayer account must have:
- **USDC Balance**: At least 0.01 USDC for the deposit
- **ETH Balance**: Sufficient ETH for gas fees (deployment + withdrawal)

## 🛠️ Usage

### Basic Usage

```bash
# Run the complete flow script
node scripts/hardhat/deployAccountWithWithdrawal.js
```

### With Custom Environment

```bash
# Set environment variables and run
PRIVATE_KEY=your_private_key BASE_SEPOLIA_RPC=your_rpc_url node scripts/hardhat/deployAccountWithWithdrawal.js
```

## 📖 Detailed Flow Breakdown

### Step 1: User Creation

```javascript
// Create random user wallet (this is the account owner)
const userWallet = ethers.Wallet.createRandom();
const userAddress = userWallet.address;
console.log("Random User Address:", userAddress);
console.log("Random User Private Key:", userWallet.privateKey);
```

**What happens:**
- Generates a completely random private key
- Creates a new user wallet
- This user will own the deployed account

### Step 2: Account Address Computation

```javascript
// Generate unique salt for deterministic address
const salt = ethers.keccak256(ethers.toUtf8Bytes("user-deployment-" + Date.now()));

// Calculate expected account address
const expectedAccount = await nexusAccountFactory.computeAccountAddress(initData, salt);
```

**What happens:**
- Computes the deterministic address for the new account
- Uses a unique salt based on timestamp
- This address will be used for the account deployment

### Step 3: USDC Pre-transfer

```javascript
// Transfer USDC to expected account before deployment
const transferTx = await usdc.transfer(expectedAccount, TRANSFER_AMOUNT);
await transferTx.wait();
```

**What happens:**
- Relayer transfers 0.01 USDC to the expected account address
- This ensures the account has funds when it's deployed
- The funds will be automatically deposited into Aave

### Step 4: Account Deployment with AutoEarn

```javascript
// Deploy account and execute AutoEarn in single transaction
const deploymentCalls = [
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

const deploymentTx = await multicall3.aggregate3(deploymentCalls, { gasLimit: 2000000 });
```

**What happens:**
- Deploys the Nexus account with AutoEarn module
- Automatically deposits the USDC into Aave for earning
- Both operations happen atomically in a single transaction

### Step 5: UserOp Creation for Withdrawal

```javascript
// Create call data for withdrawal + transfer
const withdrawCallData = autoEarnModule.interface.encodeFunctionData("withdrawFromVault", [
    USDC_ADDRESS,
    TRANSFER_AMOUNT,
    expectedAccount // Withdraw to the account itself first
]);

const transferCallData = usdc.interface.encodeFunctionData("transfer", [
    relayerWallet.address,
    TRANSFER_AMOUNT
]);

// Batch both calls using Multicall3
const batchCallData = multicall3.interface.encodeFunctionData("aggregate3", [[
    {
        target: deployments.modules.autoEarnModule,
        allowFailure: false,
        callData: withdrawCallData
    },
    {
        target: USDC_ADDRESS,
        allowFailure: false,
        callData: transferCallData
    }
]]);
```

**What happens:**
- Creates call data to withdraw USDC from Aave
- Creates call data to transfer USDC to relayer
- Batches both operations using Multicall3

### Step 6: User Signs UserOp

```javascript
// Create UserOp hash
const userOpHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes32", "bytes32"],
        [
            userOp.sender,
            userOp.nonce,
            ethers.keccak256(userOp.callData),
            ethers.keccak256("0x") // initCode hash (empty for existing account)
        ]
    )
);

// Sign with user's private key
const userSignature = await userWallet.signMessage(ethers.getBytes(userOpHash));
userOp.signature = userSignature;
```

**What happens:**
- Creates a UserOp hash containing the withdrawal operation
- User signs the UserOp with their private key
- This proves the user authorized the withdrawal

### Step 7: Relayer Executes UserOp

```javascript
// Execute the UserOp via EntryPoint (relayer pays gas)
const userOpTx = await entryPoint.handleOps([userOp], relayerWallet.address, {
    gasLimit: 1000000 // Relayer pays gas
});
```

**What happens:**
- Relayer submits the UserOp to EntryPoint
- Relayer pays all gas fees
- Withdrawal and transfer are executed atomically
- Funds are returned to the relayer

## 🔧 Configuration

### AutoEarn Module Configuration

The script configures the AutoEarn module with:

- **Chain ID**: 84532 (Base Sepolia)
- **Token**: USDC (0x036CbD53842c5426634e7929541eC2318f3dCF7e)
- **Vault**: Aave Pool (0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b)

### Account Configuration

Each deployed account includes:

- **Owner**: Random user (generated private key)
- **Validators**: K1Validator (installed by default)
- **Executors**: AutoEarn module
- **Registry**: MockRegistry with user as attester

### UserOp Configuration

The UserOp is configured with:

- **Gas Limits**: Optimized for withdrawal operations
- **Fee Structure**: Relayer pays all fees
- **Nonce Management**: Uses EntryPoint nonce system

## 📊 Output

### Console Output

```
=== Deploy Account with AutoEarn and Withdrawal Flow ===
Relayer: 0xAF9fC206261DF20a7f2Be9B379B101FAFd983117
Random User Address: 0x...
Random User Private Key: 0x...

=== Step 1: Transfer USDC to Account ===
Transferring 0.01 USDC to expected account...
USDC transferred successfully

=== Step 2: Deploy Account with AutoEarn ===
Executing account deployment with AutoEarn...
Account deployed successfully!
Transaction hash: 0x...
Account USDC balance after deployment: 0.000000
AutoEarn module initialized: true

=== Step 3: Create UserOp for Withdrawal ===
Account nonce: 0
UserOp created:
- Sender: 0x...
- Nonce: 0
- Call Data Length: 292

=== Step 4: Sign UserOp with User's Private Key ===
UserOp signed with user's private key
Signature: 0x...

=== Step 5: Execute UserOp via EntryPoint ===
UserOp executed successfully!
Transaction hash: 0x...
Gas used: 234567

=== Final Results ===
Account USDC balance: 0.000000
Relayer USDC balance: 9.961094

🎉 SUCCESS: Complete flow executed!
✅ Account deployed with AutoEarn module
✅ USDC deposited and earning in Aave
✅ User signed UserOp for withdrawal
✅ Relayer executed withdrawal and transfer
✅ Funds returned to relayer
```

### Deployment Tracking

The script saves complete deployment data to `user-deployments.json`:

```json
[
  {
    "userAddress": "0x...",
    "userPrivateKey": "0x...",
    "accountAddress": "0x...",
    "relayerAddress": "0x...",
    "deployedAt": "2024-01-15T10:30:00.000Z",
    "deploymentTxHash": "0x...",
    "withdrawalTxHash": "0x...",
    "salt": "0x...",
    "initialUSDC": "0.01",
    "finalAccountBalance": "0.000000",
    "finalRelayerBalance": "9.961094"
  }
]
```

## 🚨 Error Handling

### Fallback Execution

If EntryPoint execution fails, the script falls back to direct contract calls:

```javascript
try {
    // Try EntryPoint first
    const userOpTx = await entryPoint.handleOps([userOp], relayerWallet.address);
} catch (error) {
    // Fallback to direct contract calls
    const directWithdrawTx = await accountContract.execute(
        deployments.modules.autoEarnModule,
        0,
        withdrawCallData
    );
    const directTransferTx = await accountContract.execute(
        USDC_ADDRESS,
        0,
        transferCallData
    );
}
```

### Common Issues

1. **Insufficient Relayer Balance**
   ```
   Error: Insufficient USDC balance
   ```
   **Solution**: Ensure relayer has at least 0.01 USDC

2. **Gas Estimation Failures**
   ```
   Error: gas required exceeds allowance
   ```
   **Solution**: Increase gas limits or check network congestion

3. **UserOp Validation Failures**
   ```
   Error: UserOp validation failed
   ```
   **Solution**: Check signature validity and nonce management

## 🔍 Debugging

### Enable Debug Mode

The script includes comprehensive debugging:

- Step-by-step execution logging
- Transaction hash tracking
- Balance verification at each step
- Error details with fallback options

### Manual Testing

You can test individual components:

```javascript
// Test account deployment
const expectedAccount = await nexusAccountFactory.computeAccountAddress(initData, salt);

// Test USDC transfer
const transferTx = await usdc.transfer(expectedAccount, TRANSFER_AMOUNT);

// Test UserOp creation
const userOpHash = ethers.keccak256(/* ... */);
const signature = await userWallet.signMessage(ethers.getBytes(userOpHash));
```

## 📚 Technical Details

### Contract ABIs

The script uses comprehensive ABIs:

```javascript
const ENTRY_POINT_ABI = [
    "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] userOps, address beneficiary) external",
    "function getNonce(address sender, uint192 key) external view returns (uint256)"
];

const AUTO_EARN_ABI = [
    "function autoEarn(address token, uint256 amount, address nexusAccount, uint256 nonce, bytes calldata signature) external",
    "function withdrawFromVault(address token, uint256 amount, address to) external",
    "function isInitialized(address account) external view returns (bool)"
];
```

### Gas Optimization

- Uses explicit gas limits for each operation
- Batches operations using Multicall3
- Optimizes UserOp gas parameters

### Security Features

- ECDSA signature verification for all operations
- Nonce management to prevent replay attacks
- User-controlled authorization for withdrawals
- Relayer gas sponsorship without fund access

## 🎯 Use Cases

1. **User Onboarding**: Complete flow for new users
2. **Integration Testing**: Test full user journey
3. **Demo Applications**: Showcase account capabilities
4. **Gasless Transactions**: Demonstrate relayer sponsorship

## 🔄 Integration with Other Scripts

This script complements other deployment scripts:

- **Foundry Script**: Deploys core contracts and modules
- **Basic Node.js Script**: Simple account deployment
- **Enhanced Script**: Complete user journey with withdrawal

All scripts use the same `deployments.json` file for consistency.

## 📝 Security Considerations

### User Private Key Management

- **Never store private keys in production**
- **Use secure key management systems**
- **Implement proper key rotation**

### Relayer Security

- **Monitor relayer balances**
- **Implement rate limiting**
- **Use proper authorization mechanisms**

### Transaction Security

- **Validate all UserOp signatures**
- **Check nonce management**
- **Implement proper error handling**

## 📝 License

This script is part of the Nexus project and follows the same licensing terms.

---

**Note**: This script is designed for Base Sepolia testnet. For mainnet deployment, update the contract addresses, network configuration, and implement proper security measures.
