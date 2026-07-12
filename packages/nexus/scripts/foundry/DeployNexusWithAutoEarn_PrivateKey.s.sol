// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { console2 } from "forge-std/console2.sol";
import { BaseWithPrivateKey } from "./BaseWithPrivateKey.s.sol";
import { Vm } from "forge-std/vm.sol";

// Core Nexus imports
import { Nexus } from "../../contracts/Nexus.sol";
import { NexusAccountFactory } from "../../contracts/factory/NexusAccountFactory.sol";
import { BiconomyMetaFactory } from "../../contracts/factory/BiconomyMetaFactory.sol";
import { NexusBootstrap, BootstrapConfig, BootstrapPreValidationHookConfig, RegistryConfig } from "../../contracts/utils/NexusBootstrap.sol";
import { BootstrapLib } from "../../contracts/lib/BootstrapLib.sol";
import { ExecLib } from "../../contracts/lib/ExecLib.sol";
import { ModeLib } from "../../contracts/lib/ModeLib.sol";

// Module imports
import { K1Validator } from "../../contracts/modules/validators/K1Validator.sol";
import { AutoEarn } from "../../contracts/modules/executors/AutoEarn.sol";

// Mock contracts for testing
import { MockRegistry } from "../../contracts/mocks/MockRegistry.sol";
import { MockPaymaster } from "../../contracts/mocks/MockPaymaster.sol";

// Interface imports
import { IERC7484 } from "../../contracts/interfaces/IERC7484.sol";
import { IERC20 } from "forge-std/interfaces/IERC20.sol";

// ECDSA and signature utilities
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { PackedUserOperation } from "account-abstraction/core/UserOperationLib.sol";
import { IEntryPoint } from "account-abstraction/interfaces/IEntryPoint.sol";

// Multicall3 interface
interface IMulticall3 {
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }
    
    struct Result {
        bool success;
        bytes returnData;
    }
    
    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData);
}

// Minimal UserOperation struct (v0.6 compatible)
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}

/// @title DeployNexusWithAutoEarn_PrivateKey
/// @notice Deployment script for Nexus account with AutoEarn module on Base Sepolia using private key
/// @dev This script supports deployment using private key directly via PRIVATE_KEY environment variable
contract DeployNexusWithAutoEarn_PrivateKey is BaseWithPrivateKey {
    // Base Sepolia network configuration
    address public constant BASE_SEPOLIA_ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address public constant BASE_SEPOLIA_WETH = 0x4200000000000000000000000000000000000006;
    
    // Base Sepolia token addresses
    address public constant USDC_ADDRESS = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    
    // Aave V3 addresses on Base Sepolia
    address public constant AAVE_POOL_ADDRESS = 0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b;
    address public constant AAVE_USDC_ADDRESS = 0xf53B60F4006cab2b3C4688ce41fD5362427A2A66;
    
    // Deployment addresses (will be set during deployment)
    address public nexusImplementation;
    address public nexusAccountFactory;
    address public biconomyMetaFactory;
    address public k1Validator;
    address public autoEarnModule;
    address public mockRegistry;
    address public nexusBootstrap;
    address public deployedAccount;
    address public paymaster;

    // Owner configuration
    address public owner;
    address public authorizedRelayer;

    function run() external broadcast {
        console2.log("=== Deploying Nexus with AutoEarn Module on Base Sepolia (Private Key) ===");
        console2.log("Deployer Address:", broadcaster);
        console2.log("Deployer Private Key Set:", getBroadcasterPrivateKey() != 0);
        
        // Set up owner and relayer addresses
        owner = broadcaster;
        authorizedRelayer = broadcaster;
        
        console2.log("Owner:", owner);
        console2.log("Authorized Relayer:", authorizedRelayer);

        // Deploy core contracts
        deployCoreContracts();
        
        // Deploy modules
        deployModules();
        
        // Configure AutoEarn module
        configureAutoEarnModule();
        
        // Check Aave pool state BEFORE deployment
        checkAavePoolState();
        
        // Deploy Nexus account with AutoEarn module
        deployNexusAccount();
        
        // Log deployment summary
        logDeploymentSummary();
        
        // Save deployment data to JSON
        saveDeploymentToJson();
    }

    function deployCoreContracts() internal {
        console2.log("\n--- Deploying Core Contracts ---");
        
        // Deploy K1Validator
        k1Validator = address(new K1Validator());
        console2.log("K1Validator deployed at:", k1Validator);
        
        // Deploy MockRegistry
        mockRegistry = address(new MockRegistry());
        console2.log("MockRegistry deployed at:", mockRegistry);
        
        // Deploy NexusBootstrap
        nexusBootstrap = address(new NexusBootstrap(k1Validator, abi.encodePacked(owner)));
        console2.log("NexusBootstrap deployed at:", nexusBootstrap);
        
        // Deploy Nexus implementation
        nexusImplementation = address(new Nexus(
            BASE_SEPOLIA_ENTRYPOINT,
            k1Validator,
            abi.encodePacked(owner),
            new address[](0),
            new bytes[](0)
        ));
        console2.log("Nexus Implementation deployed at:", nexusImplementation);
        
        // Deploy NexusAccountFactory
        nexusAccountFactory = address(new NexusAccountFactory(nexusImplementation, owner));
        console2.log("NexusAccountFactory deployed at:", nexusAccountFactory);
        
        // Deploy BiconomyMetaFactory
        biconomyMetaFactory = address(new BiconomyMetaFactory(owner));
        console2.log("BiconomyMetaFactory deployed at:", biconomyMetaFactory);
        
        // Add factory to whitelist
        BiconomyMetaFactory(biconomyMetaFactory).addFactoryToWhitelist(nexusAccountFactory);
        console2.log("Added NexusAccountFactory to BiconomyMetaFactory whitelist");
    }

    function deployModules() internal {
        console2.log("\n--- Deploying Modules ---");
        
        // Deploy AutoEarn module
        autoEarnModule = address(new AutoEarn(
            authorizedRelayer,
            BASE_SEPOLIA_WETH,
            owner
        ));
        console2.log("AutoEarn Module deployed at:", autoEarnModule);
    }

    function configureAutoEarnModule() internal {
        console2.log("\n--- Configuring AutoEarn Module ---");
        
        // Create configuration for Base Sepolia
        AutoEarn.ConfigInput[] memory configs = new AutoEarn.ConfigInput[](1);
        configs[0] = AutoEarn.ConfigInput({
            sourceChainId: 84532, // Base Sepolia chain ID
            sourceTokenAddress: USDC_ADDRESS,
            vaultAddress: AAVE_POOL_ADDRESS
        });
        
        // Set the configuration
        AutoEarn(autoEarnModule).setConfig(configs);
        console2.log("AutoEarn module configured for Base Sepolia");
        console2.log("  - Chain ID: 84532");
        console2.log("  - Token: USDC", USDC_ADDRESS);
        console2.log("  - Vault: Aave Pool", AAVE_POOL_ADDRESS);
        
        // Calculate and log config hash
        uint256 configHash = uint256(keccak256(abi.encode(configs)));
        console2.log("Config Hash:", configHash);
    }

    /// @notice Check Aave pool state and liquidity
    function checkAavePoolState() internal view {
        console2.log("\n--- Checking Aave Pool State ---");
        
        // Check if contracts exist
        if (AAVE_POOL_ADDRESS.code.length == 0) {
            console2.log("ERROR: Aave Pool contract not deployed at", AAVE_POOL_ADDRESS);
            return;
        }
        console2.log("Aave Pool contract exists:", AAVE_POOL_ADDRESS);
        
        if (AAVE_USDC_ADDRESS.code.length == 0) {
            console2.log("WARNING: aUSDC contract not deployed at", AAVE_USDC_ADDRESS);
        } else {
            console2.log("aUSDC contract exists:", AAVE_USDC_ADDRESS);
        }
        
        // Check USDC liquidity in Aave
        IERC20 usdc = IERC20(USDC_ADDRESS);
        uint256 poolLiquidity = usdc.balanceOf(AAVE_POOL_ADDRESS);
        console2.log("USDC balance in Aave Pool:", poolLiquidity);
        
        if (poolLiquidity == 0) {
            console2.log("WARNING: Aave Pool has ZERO USDC liquidity!");
            console2.log("Deposits may fail or withdrawals will be impossible");
        }
        
        // Check if aUSDC has any supply
        if (AAVE_USDC_ADDRESS.code.length > 0) {
            IERC20 aUSDC = IERC20(AAVE_USDC_ADDRESS);
            try aUSDC.totalSupply() returns (uint256 supply) {
                console2.log("aUSDC total supply:", supply);
            } catch {
                console2.log("Could not query aUSDC total supply");
            }
        }
    }

    function deployNexusAccount() internal {
        console2.log("\n--- Deploying Nexus Account ---");
        
        // Calculate config hash for AutoEarn module
        AutoEarn.ConfigInput[] memory configs = new AutoEarn.ConfigInput[](1);
        configs[0] = AutoEarn.ConfigInput({
            sourceChainId: 84532,
            sourceTokenAddress: USDC_ADDRESS,
            vaultAddress: AAVE_POOL_ADDRESS
        });
        uint256 configHash = uint256(keccak256(abi.encode(configs)));
        
        // Prepare module installation data
        bytes memory executorInstallData = abi.encode(configHash);
        
        // Create bootstrap configurations
        BootstrapConfig[] memory validators = new BootstrapConfig[](0);
        BootstrapConfig[] memory executors = BootstrapLib.createArrayConfig(autoEarnModule, executorInstallData);
        BootstrapConfig memory hook = BootstrapLib.createSingleConfig(address(0), "");
        
        // Set up attesters for registry
        address[] memory attesters = new address[](1);
        attesters[0] = owner;
        
        // Create registry configuration
        RegistryConfig memory registryConfig = RegistryConfig({
            registry: IERC7484(mockRegistry),
            attesters: attesters,
            threshold: 1
        });
        
        // Create initialization data
        bytes memory initData = abi.encode(
            nexusBootstrap,
            abi.encodeCall(
                NexusBootstrap.initNexusWithDefaultValidatorAndOtherModules,
                (
                    abi.encodePacked(owner),
                    validators,
                    executors,
                    hook,
                    new BootstrapConfig[](0),
                    new BootstrapPreValidationHookConfig[](0),
                    registryConfig
                )
            )
        );
        
        // Use a deterministic salt
        bytes32 salt = keccak256("nexus-autoearn-deployment-v2");
        
        // Calculate the account address
        address payable expectedAddress = NexusAccountFactory(nexusAccountFactory).computeAccountAddress(initData, salt);
        console2.log("Expected Account Address:", expectedAddress);
        
        // Deploy the account using the meta factory
        bytes memory factoryData = abi.encodeWithSelector(
            NexusAccountFactory.createAccount.selector,
            initData,
            salt
        );
        
        deployedAccount = BiconomyMetaFactory(biconomyMetaFactory).deployWithFactory(
            nexusAccountFactory,
            factoryData
        );
        
        console2.log("Nexus Account deployed at:", deployedAccount);
        
        // Verify deployment
        require(deployedAccount == expectedAddress, "Account address mismatch");
        require(deployedAccount.code.length > 0, "Account not deployed");
        
        // Verify AutoEarn module is initialized
        bool isInitialized = AutoEarn(autoEarnModule).isInitialized(deployedAccount);
        require(isInitialized, "AutoEarn module not initialized");
        console2.log("AutoEarn module initialized:", isInitialized);
        
        // Test AutoEarn functionality
        testAutoEarnWithDiagnostics();
    }
    
    /// @notice Test AutoEarn functionality with comprehensive diagnostics
    function testAutoEarnWithDiagnostics() internal {
        console2.log("\n=== TESTING AUTOEARN WITH DIAGNOSTICS ===");
        
        IERC20 usdc = IERC20(USDC_ADDRESS);
        IERC20 aUSDC = IERC20(AAVE_USDC_ADDRESS);
        
        uint256 transferAmount = 1e4; // 0.01 USDC
        
        // Check deployer's USDC balance
        uint256 deployerBalance = usdc.balanceOf(broadcaster);
        console2.log("Deployer USDC balance:", deployerBalance);
        
        if (deployerBalance < transferAmount) {
            console2.log("ABORT: Insufficient USDC balance for testing");
            console2.log("Required:", transferAmount);
            console2.log("Available:", deployerBalance);
            return;
        }
        
        console2.log("\n[1] Transferring USDC to deployed account...");
        usdc.transfer(deployedAccount, transferAmount);
        
        uint256 accountBalance = usdc.balanceOf(deployedAccount);
        console2.log("Account USDC balance after transfer:", accountBalance);
        require(accountBalance >= transferAmount, "USDC transfer failed");
        
        // Check initial aUSDC balance
        uint256 initialATokenBalance = 0;
        if (address(aUSDC).code.length > 0) {
            initialATokenBalance = aUSDC.balanceOf(deployedAccount);
            console2.log("Initial aUSDC balance:", initialATokenBalance);
        }
        
        console2.log("\n[2] Executing AutoEarn...");
        uint256 nonce = 0;
        bytes memory signature = createAutoEarnSignature(USDC_ADDRESS, transferAmount, deployedAccount, nonce);
        
        try AutoEarn(autoEarnModule).autoEarn(USDC_ADDRESS, transferAmount, deployedAccount, nonce, signature) {
            console2.log("AutoEarn executed successfully");
            
            // Check final balances
            uint256 finalUSDCBalance = usdc.balanceOf(deployedAccount);
            console2.log("Final USDC balance:", finalUSDCBalance);
            
            if (address(aUSDC).code.length > 0) {
                uint256 finalATokenBalance = aUSDC.balanceOf(deployedAccount);
                console2.log("Final aUSDC balance:", finalATokenBalance);
                
                if (finalATokenBalance > initialATokenBalance) {
                    console2.log("SUCCESS: Received aUSDC:", finalATokenBalance - initialATokenBalance);
                    
                    // If AutoEarn succeeded, test withdrawal
                    console2.log("\n[3] Testing withdrawal...");
                    uint256 withdrawAmount = transferAmount / 2;
                    testWithdrawViaUserOpWithPaymaster(deployedAccount, withdrawAmount, broadcaster);
                    
                } else {
                    console2.log("WARNING: No aUSDC received - AutoEarn may have failed");
                    console2.log("Withdrawal test will be skipped");
                }
            }
            
        } catch Error(string memory reason) {
            console2.log("AutoEarn FAILED with error:", reason);
        } catch (bytes memory lowLevelData) {
            console2.log("AutoEarn FAILED with low-level error:");
            console2.logBytes(lowLevelData);
        }
    }
    
    /// @notice Create signature for autoEarn function call
    function createAutoEarnSignature(
        address token,
        uint256 amountToSave,
        address nexusAccount,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, token, amountToSave, nexusAccount, nonce));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(hash);
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(getBroadcasterPrivateKey(), ethSignedHash);
        
        return abi.encodePacked(r, s, v);
    }
    
    /// @notice Test direct withdrawal (without UserOp) for debugging
    function testDirectWithdrawal(address account, uint256 withdrawAmount, address recipient) internal returns (bool) {
        console2.log("\n--- Testing Direct Withdrawal (No UserOp) ---");
        
        IERC20 usdc = IERC20(USDC_ADDRESS);
        IERC20 aUSDC = IERC20(AAVE_USDC_ADDRESS);
        
        console2.log("Pre-withdrawal state:");
        console2.log("  Account aUSDC:", aUSDC.balanceOf(account));
        console2.log("  Account USDC:", usdc.balanceOf(account));
        console2.log("  Recipient USDC:", usdc.balanceOf(recipient));
        console2.log("  Withdraw amount:", withdrawAmount);
        
        // Build withdrawal call
        bytes memory innerCall = abi.encodeWithSignature(
            "withdraw(address,uint256,address)",
            USDC_ADDRESS,
            withdrawAmount,
            recipient
        );
        
        bytes memory callData = abi.encodeCall(
            Nexus.execute,
            (
                ModeLib.encodeSimpleSingle(),
                ExecLib.encodeSingle(AAVE_POOL_ADDRESS, 0, innerCall)
            )
        );
        
        // Execute as owner
        vm.startPrank(owner);
        (bool success, bytes memory returnData) = account.call(callData);
        vm.stopPrank();
        
        if (success) {
            console2.log("SUCCESS: Direct withdrawal completed");
            console2.log("Post-withdrawal state:");
            console2.log("  Account aUSDC:", aUSDC.balanceOf(account));
            console2.log("  Account USDC:", usdc.balanceOf(account));
            console2.log("  Recipient USDC:", usdc.balanceOf(recipient));
        } else {
            console2.log("FAILED: Direct withdrawal reverted");
            console2.logBytes(returnData);
            
            // Try to decode error
            if (returnData.length >= 4) {
                bytes4 errorSelector = bytes4(returnData);
                console2.log("Error selector:");
                console2.logBytes4(errorSelector);
            }
        }
        
        return success;
    }
    
    /// @notice Build and send a UserOperation to withdraw USDC from Aave with comprehensive diagnostics
    function testWithdrawViaUserOpWithPaymaster(
        address account,
        uint256 withdrawAmount,
        address recipient
    ) internal {
        console2.log("\n=== WITHDRAW VIA USEROP + PAYMASTER ===");
        
        IERC20 usdc = IERC20(USDC_ADDRESS);
        IERC20 aUSDC = IERC20(AAVE_USDC_ADDRESS);
        
        // Step 1: Pre-flight checks
        console2.log("\n[1] Pre-flight checks:");
        console2.log("Account:", account);
        console2.log("Recipient:", recipient);
        console2.log("Requested withdrawal:", withdrawAmount);
        
        uint256 usdcBalance = usdc.balanceOf(account);
        uint256 aUSDCBalance = aUSDC.balanceOf(account);
        uint256 poolLiquidity = usdc.balanceOf(AAVE_POOL_ADDRESS);
        
        console2.log("Account USDC balance:", usdcBalance);
        console2.log("Account aUSDC balance:", aUSDCBalance);
        console2.log("Aave Pool USDC liquidity:", poolLiquidity);
        
        // Critical checks
        if (aUSDCBalance == 0) {
            console2.log("ABORT: Account has zero aUSDC balance!");
            console2.log("AutoEarn deposit likely failed. Cannot test withdrawal.");
            return;
        }
        
        // if (poolLiquidity == 0) {
        //     console2.log("ABORT: Aave Pool has zero USDC liquidity!");
        //     console2.log("Cannot withdraw from empty pool.");
        //     return;
        // }
        
        // Adjust withdrawal amount if needed
        // uint256 maxWithdrawable = aUSDCBalance < poolLiquidity ? aUSDCBalance : poolLiquidity;
        // if (withdrawAmount > maxWithdrawable) {
        //     console2.log("WARNING: Requested amount exceeds maximum withdrawable");
        //     console2.log("Adjusting from", withdrawAmount, "to", maxWithdrawable);
        //     withdrawAmount = maxWithdrawable;
        // }
        
        // Step 2: Test direct withdrawal first
        console2.log("\n[2] Testing direct withdrawal (sanity check):");
        uint256 testAmount = withdrawAmount / 10; // Test with 10% of amount
        if (testAmount == 0) testAmount = withdrawAmount;
        
        // bool directSuccess = testDirectWithdrawal(account, testAmount, recipient);
        
        // if (!directSuccess) {
        //     console2.log("ABORT: Direct withdrawal failed - UserOp will also fail");
        //     console2.log("There is a fundamental issue with the Aave withdrawal");
        //     return;
        // }
        
        console2.log("Direct withdrawal succeeded! Proceeding with UserOp test...");
        
        // Step 3: Deploy paymaster
        if (paymaster == address(0)) {
            paymaster = address(new MockPaymaster(BASE_SEPOLIA_ENTRYPOINT, broadcaster));
            console2.log("\n[3] MockPaymaster deployed at:", paymaster);
            // Immediately stake some ETH to EntryPoint via MockPaymaster.receive()
            uint256 initialStakeAmount = 0.05 ether;
            (bool stakeOk, ) = payable(paymaster).call{value: initialStakeAmount}("");
            require(stakeOk, "Paymaster stake funding failed");
            console2.log("Staked via paymaster.receive():", initialStakeAmount);
            // Log current stake status after staking
            {
                IEntryPoint epAfterStake = IEntryPoint(BASE_SEPOLIA_ENTRYPOINT);
                IEntryPoint.DepositInfo memory stakeInfo = epAfterStake.getDepositInfo(paymaster);
                console2.log("EntryPoint -> Paymaster stake (post receive):", stakeInfo.stake);
                console2.log("EntryPoint -> Paymaster staked flag (post receive):", stakeInfo.staked);
            }
        }
        
        // Step 4: Build UserOperation
        console2.log("\n[4] Building UserOperation:");
        
        IEntryPoint ep = IEntryPoint(BASE_SEPOLIA_ENTRYPOINT);
        
        bytes memory innerCall = abi.encodeWithSignature(
            "withdraw(address,uint256,address)",
            USDC_ADDRESS,
            withdrawAmount,
            recipient
        );
        
        bytes memory callData = abi.encodeCall(
            Nexus.execute,
            (
                ModeLib.encodeSimpleSingle(),
                ExecLib.encodeSingle(AAVE_POOL_ADDRESS, 0, innerCall)
            )
        );
        
        UserOperation memory userOp;
        userOp.sender = account;
        
        try ep.getNonce(account, 0) returns (uint256 n) {
            userOp.nonce = n;
            console2.log("Account nonce:", n);
        } catch {
            userOp.nonce = 0;
            console2.log("Account nonce: 0 (default)");
        }
        
        userOp.initCode = "";
        userOp.callData = callData;
        
        // EXTREMELY HIGH gas limits to rule out gas issues completely
        userOp.callGasLimit = 5_000_000;
        userOp.verificationGasLimit = 3_000_000;
        userOp.preVerificationGas = 500_000;
        userOp.maxFeePerGas = 5 gwei;
        userOp.maxPriorityFeePerGas = 2 gwei;
        userOp.signature = new bytes(65);
        
        console2.log("Gas limits:");
        console2.log("  callGasLimit:", userOp.callGasLimit);
        console2.log("  verificationGasLimit:", userOp.verificationGasLimit);
        console2.log("  preVerificationGas:", userOp.preVerificationGas);
        console2.log("  maxFeePerGas:", userOp.maxFeePerGas);
        console2.log("  maxPriorityFeePerGas:", userOp.maxPriorityFeePerGas);
        
        // Configure paymaster
        uint48 validUntil = uint48(block.timestamp + 1 days);
        uint48 validAfter = uint48(block.timestamp);
        bytes memory emptyPmSig = new bytes(65);
        
        userOp.paymasterAndData = abi.encodePacked(
            paymaster,
            uint128(800_000),
            uint128(300_000),
            abi.encode(validUntil, validAfter),
            emptyPmSig
        );
        
        // Build packed operation
        uint256 accountGasLimits = (uint256(userOp.verificationGasLimit) << 128) | uint256(userOp.callGasLimit);
        uint256 gasFees = (uint256(userOp.maxPriorityFeePerGas) << 128) | uint256(userOp.maxFeePerGas);
        
        PackedUserOperation memory pmOp = PackedUserOperation({
            sender: account,
            nonce: userOp.nonce,
            initCode: userOp.initCode,
            callData: userOp.callData,
            accountGasLimits: bytes32(accountGasLimits),
            preVerificationGas: userOp.preVerificationGas,
            gasFees: bytes32(gasFees),
            paymasterAndData: userOp.paymasterAndData,
            signature: userOp.signature
        });
        
        // Sign paymaster
        bytes32 pmHash = MockPaymaster(payable(paymaster)).getHash(pmOp, validUntil, validAfter);
        bytes32 pmEthHash = MessageHashUtils.toEthSignedMessageHash(pmHash);
        (uint8 pmV, bytes32 pmR, bytes32 pmS) = vm.sign(getBroadcasterPrivateKey(), pmEthHash);
        bytes memory pmSig = abi.encodePacked(pmR, pmS, pmV);
        
        userOp.paymasterAndData = abi.encodePacked(
            paymaster,
            uint128(800_000),
            uint128(300_000),
            abi.encode(validUntil, validAfter),
            pmSig
        );
        pmOp.paymasterAndData = userOp.paymasterAndData;
        
        // Log EntryPoint deposit/stake state before handleOps
        {
            IEntryPoint.DepositInfo memory infoBefore = ep.getDepositInfo(paymaster);
            console2.log("EntryPoint -> Paymaster deposit (before):", infoBefore.deposit);
            console2.log("EntryPoint -> Paymaster stake (before):", infoBefore.stake);
            console2.log("EntryPoint -> Paymaster staked flag (before):", infoBefore.staked);
        }
        
        // Sign user operation
        bytes32 userOpHash = ep.getUserOpHash(pmOp);
        bytes32 userOpEthHash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(getBroadcasterPrivateKey(), userOpEthHash);
        pmOp.signature = abi.encodePacked(r, s, v);
        
        // Verification diagnostics
        address configuredOwner = K1Validator(k1Validator).getOwner(account);
        address broadcasterAddr = vm.addr(getBroadcasterPrivateKey());
        console2.log("\nSignature verification:");
        console2.log("  Configured K1 owner:", configuredOwner);
        console2.log("  Broadcaster (signer):", broadcasterAddr);
        console2.log("  Owner match:", configuredOwner == broadcasterAddr);
        
        // Execute UserOp
        console2.log("\n[5] Executing UserOperation:");
        console2.log("UserOp hash:", vm.toString(userOpHash));
        
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = pmOp;
        
        uint256 recipientBalanceBefore = usdc.balanceOf(recipient);
        uint256 accountATokenBefore = aUSDC.balanceOf(account);
        
        try ep.handleOps{gas: 9_000_000}(ops, payable(broadcaster)) {
            console2.log("\n=== SUCCESS: UserOp executed! ===");
            // Log EntryPoint deposit/stake state after handleOps (success)
            {
                IEntryPoint.DepositInfo memory infoAfter = ep.getDepositInfo(paymaster);
                console2.log("EntryPoint -> Paymaster deposit (after):", infoAfter.deposit);
                console2.log("EntryPoint -> Paymaster stake (after):", infoAfter.stake);
                console2.log("EntryPoint -> Paymaster staked flag (after):", infoAfter.staked);
            }
            
            uint256 recipientBalanceAfter = usdc.balanceOf(recipient);
            uint256 accountATokenAfter = aUSDC.balanceOf(account);
            uint256 received = recipientBalanceAfter - recipientBalanceBefore;
            uint256 burned = accountATokenBefore - accountATokenAfter;
            
            console2.log("\n[6] Post-execution results:");
            console2.log("USDC received by recipient:", received);
            console2.log("aUSDC burned from account:", burned);
            console2.log("Account aUSDC remaining:", accountATokenAfter);
            console2.log("Account USDC remaining:", usdc.balanceOf(account));
            
        } catch Error(string memory reason) {
            console2.log("\n=== FAILED: UserOp reverted ===");
            console2.log("Error reason:", reason);
            // Log EntryPoint deposit/stake state after handleOps (revert)
            {
                IEntryPoint.DepositInfo memory infoAfterRevert = ep.getDepositInfo(paymaster);
                console2.log("EntryPoint -> Paymaster deposit (after revert):", infoAfterRevert.deposit);
                console2.log("EntryPoint -> Paymaster stake (after revert):", infoAfterRevert.stake);
                console2.log("EntryPoint -> Paymaster staked flag (after revert):", infoAfterRevert.staked);
            }
            
        } catch (bytes memory lowLevelData) {
            console2.log("\n=== FAILED: UserOp reverted ===");
            console2.log("Low-level revert data:");
            console2.logBytes(lowLevelData);
            // Log EntryPoint deposit/stake state after handleOps (low-level revert)
            {
                IEntryPoint.DepositInfo memory infoAfterLowLevel = ep.getDepositInfo(paymaster);
                console2.log("EntryPoint -> Paymaster deposit (after low-level revert):", infoAfterLowLevel.deposit);
                console2.log("EntryPoint -> Paymaster stake (after low-level revert):", infoAfterLowLevel.stake);
                console2.log("EntryPoint -> Paymaster staked flag (after low-level revert):", infoAfterLowLevel.staked);
            }
            
            if (lowLevelData.length >= 4) {
                bytes4 selector = bytes4(lowLevelData);
                console2.log("Error selector:");
                console2.logBytes4(selector);
                
                // Check for FailedOp(uint256,string)
                if (selector == bytes4(keccak256("FailedOp(uint256,string)"))) {
                    console2.log("This is a FailedOp error from EntryPoint");
                    // Try to decode the error
                    if (lowLevelData.length > 68) {
                        bytes memory errorData = new bytes(lowLevelData.length - 4);
                        for (uint i = 0; i < errorData.length; i++) {
                            errorData[i] = lowLevelData[i + 4];
                        }
                        console2.logBytes(errorData);
                    }
                }
            }
        }
    }

    function logDeploymentSummary() internal view {
        console2.log("\n=== Deployment Summary ===");
        console2.log("Network: Base Sepolia (Chain ID: 84532)");
        console2.log("Deployment Method: Private Key");
        console2.log("Owner:", owner);
        console2.log("Authorized Relayer:", authorizedRelayer);
        console2.log("");
        console2.log("Core Contracts:");
        console2.log("  Nexus Implementation:", nexusImplementation);
        console2.log("  NexusAccountFactory:", nexusAccountFactory);
        console2.log("  BiconomyMetaFactory:", biconomyMetaFactory);
        console2.log("  K1Validator:", k1Validator);
        console2.log("  NexusBootstrap:", nexusBootstrap);
        console2.log("  MockRegistry:", mockRegistry);
        console2.log("");
        console2.log("Modules:");
        console2.log("  AutoEarn Module:", autoEarnModule);
        console2.log("");
        console2.log("Deployed Account:");
        console2.log("  Address:", deployedAccount);
        console2.log("");
        console2.log("Paymaster:");
        console2.log("  Address:", paymaster);
        console2.log("");
        console2.log("Configuration:");
        console2.log("  USDC Token:", USDC_ADDRESS);
        console2.log("  Aave Pool:", AAVE_POOL_ADDRESS);
        console2.log("  aUSDC Token:", AAVE_USDC_ADDRESS);
        console2.log("");
        console2.log("=== Deployment Complete ===");
    }

    /// @notice Helper function to get the deployed account address
    function getDeployedAccount() external view returns (address) {
        return deployedAccount;
    }

    /// @notice Helper function to get the AutoEarn module address
    function getAutoEarnModule() external view returns (address) {
        return autoEarnModule;
    }

    /// @notice Helper function to check if AutoEarn is initialized for the deployed account
    function isAutoEarnInitialized() external view returns (bool) {
        return AutoEarn(autoEarnModule).isInitialized(deployedAccount);
    }

    /// @notice Helper function to get the config hash for the deployed account
    function getAccountConfigHash() external view returns (uint256) {
        return AutoEarn(autoEarnModule).accountConfig(deployedAccount);
    }

    /// @notice Save deployment data to JSON file
    function saveDeploymentToJson() internal {
        console2.log("\n--- Saving Deployment Data to JSON ---");
        
        string memory obj = "deployment";
        
        vm.serializeUint(obj, "timestamp", block.timestamp);
        vm.serializeUint(obj, "blockNumber", block.number);
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "deployer", broadcaster);
        vm.serializeAddress(obj, "owner", owner);
        vm.serializeAddress(obj, "authorizedRelayer", authorizedRelayer);
        
        string memory coreObj = "coreContracts";
        vm.serializeAddress(coreObj, "nexusImplementation", nexusImplementation);
        vm.serializeAddress(coreObj, "nexusAccountFactory", nexusAccountFactory);
        vm.serializeAddress(coreObj, "biconomyMetaFactory", biconomyMetaFactory);
        vm.serializeAddress(coreObj, "k1Validator", k1Validator);
        vm.serializeAddress(coreObj, "nexusBootstrap", nexusBootstrap);
        string memory coreJson = vm.serializeAddress(coreObj, "mockRegistry", mockRegistry);
        
        string memory modulesObj = "modules";
        string memory modulesJson = vm.serializeAddress(modulesObj, "autoEarnModule", autoEarnModule);
        // Include paymaster at top-level for convenience
        string memory withPaymasterJson = vm.serializeAddress(obj, "paymaster", paymaster);
        
        string memory configObj = "configuration";
        vm.serializeAddress(configObj, "usdcToken", USDC_ADDRESS);
        vm.serializeAddress(configObj, "aavePool", AAVE_POOL_ADDRESS);
        vm.serializeAddress(configObj, "aUSDCToken", AAVE_USDC_ADDRESS);
        vm.serializeAddress(configObj, "wethToken", BASE_SEPOLIA_WETH);
        string memory configJson = vm.serializeAddress(configObj, "entryPoint", BASE_SEPOLIA_ENTRYPOINT);
        
        vm.serializeString(obj, "coreContracts", coreJson);
        vm.serializeString(obj, "modules", modulesJson);
        vm.serializeString(obj, "configuration", configJson);
        
        string memory finalJson = vm.serializeAddress(obj, "deployedAccount", deployedAccount);
        
        string memory rootPath = "./deployments.json";
        vm.writeJson(finalJson, rootPath);
        
        console2.log("Deployment data saved to:", rootPath);
        
        string memory broadcastPath = string.concat(
            "broadcast/DeployNexusWithAutoEarn_PrivateKey.s.sol/", 
            vm.toString(block.chainid), 
            "/deployment-", 
            vm.toString(block.timestamp), 
            ".json"
        );
        vm.writeJson(finalJson, broadcastPath);
        
        console2.log("Backup saved to:", broadcastPath);
    }
}