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
import { AutoBridgeModule } from "../../contracts/modules/executors/AutoBridge.sol";
import { AutoSwapModule } from "../../contracts/modules/executors/AutoSwap.sol";

// Mock contracts for testing
import { MockRegistry } from "../../contracts/mocks/MockRegistry.sol";

// Interface imports
import { IERC7484 } from "../../contracts/interfaces/IERC7484.sol";

// ECDSA and signature utilities
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { IERC20 } from "forge-std/interfaces/IERC20.sol";

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

/// @title DeployNexusWithAcrossModule_PrivateKey
/// @notice Deployment script for Nexus account with AutoBridge (Across) module on Base Sepolia using private key
/// @dev Bridges native ETH from Base Sepolia to Arbitrum Sepolia using Across SpokePool
contract DeployNexusWithAcrossModule_PrivateKey is BaseWithPrivateKey {
    // Base Sepolia network configuration
    address public constant BASE_SEPOLIA_ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address public constant BASE_SEPOLIA_WETH = 0x4200000000000000000000000000000000000006;
    address public constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e; // provided

    // Across SpokePool on Base Sepolia (provided)
    address public constant BASE_SEPOLIA_SPOKEPOOL = 0x82B564983aE7274c86695917BBf8C99ECb6F0F8F;

    // Uniswap V3 (Base Sepolia) per provided reference
    address public constant UNISWAP_V3_FACTORY = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address public constant UNISWAP_V3_SWAP_ROUTER_02 = 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4;
    address public constant UNISWAP_V3_QUOTER_V2 = 0xC5290058841028F1614F3A6F0F5816cAd0df5E27;

    // Multicall3 (canonical deployment address on many networks, incl. Base Sepolia)
    address public constant MULTICALL3 = 0xcA11bde05977b3631167028862bE2a173976CA11;

    // Chain IDs
    uint256 public constant BASE_SEPOLIA_CHAINID = 84532;
    uint256 public constant ARBITRUM_SEPOLIA_CHAINID = 421614;

    // NATIVE token sentinel used by AutoBridgeModule
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // Deployment addresses (will be set during deployment)
    address public nexusImplementation;
    address public nexusAccountFactory;
    address public biconomyMetaFactory;
    address public k1Validator;
    address public autoBridgeModule;
    AutoSwapModule public autoSwapModule;
    address public mockRegistry;
    address public nexusBootstrap;
    address public deployedAccount;

    // Owner/relayer configuration
    address public owner;
    address public authorizedRelayer;

    function run() external broadcast {
        console2.log("=== Deploying Nexus with Across AutoBridge Module on Base Sepolia (Private Key) ===");
        console2.log("Deployer Address:", broadcaster);
        console2.log("Deployer Private Key Set:", getBroadcasterPrivateKey() != 0);

        // Set up owner and relayer addresses
        owner = broadcaster;
        authorizedRelayer = broadcaster; // relayer signs bridge authorizations

        console2.log("Owner:", owner);
        console2.log("Authorized Relayer:", authorizedRelayer);

        // Deploy core contracts
        deployCoreContracts();

        // Deploy modules
        deployModules();

        // Configure AutoBridge module (Base Sepolia -> Arbitrum Sepolia, native ETH)
        configureAutoBridgeModule();

        // Configure AutoSwap module
        configureAutoSwapModule();

        // Execute single-transaction flow using Multicall3:
        // 1) Compute expected address and prefund
        // 2) Multicall: deploy → install module → bridge
        deployInstallAndBridgeViaMulticall();

        // Log deployment summary
        logDeploymentSummary();
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
        nexusImplementation = address(new Nexus(BASE_SEPOLIA_ENTRYPOINT, k1Validator, abi.encodePacked(owner), new address[](0), new bytes[](0)));
        console2.log("Nexus Implementation deployed at:", nexusImplementation);

        // Deploy NexusAccountFactory
        nexusAccountFactory = address(new NexusAccountFactory(nexusImplementation, owner));
        console2.log("NexusAccountFactory deployed at:", nexusAccountFactory);

        // Deploy BiconomyMetaFactory
        biconomyMetaFactory = address(new BiconomyMetaFactory(owner));
        console2.log("BiconomyMetaFactory deployed at:", biconomyMetaFactory);

        // Whitelist the account factory
        BiconomyMetaFactory(biconomyMetaFactory).addFactoryToWhitelist(nexusAccountFactory);
        console2.log("Added NexusAccountFactory to BiconomyMetaFactory whitelist");
    }

    function deployModules() internal {
        console2.log("\n--- Deploying Modules ---");

        // Deploy AutoBridge module
        autoBridgeModule = address(new AutoBridgeModule(authorizedRelayer, BASE_SEPOLIA_SPOKEPOOL, BASE_SEPOLIA_WETH, owner));
        console2.log("AutoBridgeModule deployed at:", autoBridgeModule);

        // Deploy AutoSwap module
        autoSwapModule = new AutoSwapModule(authorizedRelayer, UNISWAP_V3_SWAP_ROUTER_02, UNISWAP_V3_QUOTER_V2, BASE_SEPOLIA_WETH, owner);
        console2.log("AutoSwapModule deployed at:", address(autoSwapModule));
    }

    function configureAutoBridgeModule() internal {
        console2.log("\n--- Configuring AutoBridge Module ---");

        AutoBridgeModule.ConfigInput[] memory configs = new AutoBridgeModule.ConfigInput[](1);
        configs[0] = AutoBridgeModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            sourceTokenAddress: BASE_SEPOLIA_USDC,
            destinationChainId: ARBITRUM_SEPOLIA_CHAINID
        });

        AutoBridgeModule(autoBridgeModule).setConfig(configs);

        console2.log("AutoBridge configured:");
        console2.log("  - Origin Chain:", BASE_SEPOLIA_CHAINID);
        console2.log("  - Token: USDC");
        console2.log("  - Destination Chain:", ARBITRUM_SEPOLIA_CHAINID);

        uint256 configHash = uint256(keccak256(abi.encode(configs)));
        console2.log("Config Hash:", configHash);
    }

    function configureAutoSwapModule() internal {
        console2.log("\n--- Configuring AutoSwap Module ---");

        AutoSwapModule.ConfigInput[] memory configs = new AutoSwapModule.ConfigInput[](1);
        configs[0] = AutoSwapModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            destinationTokenAddress: BASE_SEPOLIA_WETH, // swap into WETH by default
            defaultPoolFee: 3000, // 0.3%
            slippageBps: 10000 // TEMP: 100% slippage for testnet
        });

        autoSwapModule.setConfig(configs);
        console2.log("AutoSwap configured for Base Sepolia");
        console2.log("  - Output token: WETH");
        console2.log("  - Fee: 3000");
        console2.log("  - Slippage bps: 10000 (TEMP for testnet)");

        uint256 configHash = uint256(keccak256(abi.encode(configs)));
        console2.log("Config Hash:", configHash);
    }

    function deployInstallAndBridgeViaMulticall() internal {
        console2.log("Compute, Prefund, Multicall deploy  install  bridge ---");

        // 1) Compute expected account address WITH both executors installed during bootstrap
        BootstrapConfig[] memory validators = new BootstrapConfig[](0);

        // AutoBridge config
        AutoBridgeModule.ConfigInput[] memory bridgeConfigs = new AutoBridgeModule.ConfigInput[](1);
        bridgeConfigs[0] = AutoBridgeModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            sourceTokenAddress: BASE_SEPOLIA_USDC,
            destinationChainId: ARBITRUM_SEPOLIA_CHAINID
        });
        uint256 bridgeConfigHash = uint256(keccak256(abi.encode(bridgeConfigs)));

        // AutoSwap config
        AutoSwapModule.ConfigInput[] memory swapConfigs = new AutoSwapModule.ConfigInput[](1);
        swapConfigs[0] = AutoSwapModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            destinationTokenAddress: BASE_SEPOLIA_WETH,
            defaultPoolFee: 3000,
            slippageBps: 10000
        });
        uint256 swapConfigHash = uint256(keccak256(abi.encode(swapConfigs)));

        // Create executor configs for both modules
        BootstrapConfig[] memory executors = new BootstrapConfig[](2);
        executors[0] = BootstrapLib.createSingleConfig(autoBridgeModule, abi.encode(bridgeConfigHash));
        executors[1] = BootstrapLib.createSingleConfig(address(autoSwapModule), abi.encode(swapConfigHash));
        BootstrapConfig memory hook = BootstrapLib.createSingleConfig(address(0), "");

        address[] memory attesters = new address[](1);
        attesters[0] = owner;
        RegistryConfig memory registryConfig = RegistryConfig({ registry: IERC7484(mockRegistry), attesters: attesters, threshold: 1 });

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

        bytes32 salt = keccak256("nexus-across-deployment-v1");
        address payable expectedAddress = NexusAccountFactory(nexusAccountFactory).computeAccountAddress(initData, salt);
        console2.log("Expected Account Address:", expectedAddress);

        // 2) Prefund expected address with USDC from relayer
        IERC20 usdc = IERC20(BASE_SEPOLIA_USDC);
        uint256 amountUsdc = 100_000; // 0.1 USDC (6 decimals) - double for bridge + swap
        uint256 relayerUsdc = usdc.balanceOf(authorizedRelayer);
        console2.log("Relayer:", authorizedRelayer);
        console2.log("Relayer USDC balance:", relayerUsdc);
        require(relayerUsdc >= amountUsdc, "Insufficient relayer USDC");
        bool xfer = usdc.transfer(expectedAddress, amountUsdc);
        require(xfer, "USDC transfer failed");
        console2.log("Prefunded expected account with USDC:", amountUsdc);

        // 3) Prepare Multicall: deploy → bridge (modules already installed via bootstrap)
        // Note: Skipping swap due to lack of USDC/WETH liquidity on Base Sepolia testnet
        // 3a) Deploy account via meta-factory
        bytes memory factoryData = abi.encodeWithSelector(NexusAccountFactory.createAccount.selector, initData, salt);
        bytes memory deployCall = abi.encodeWithSelector(BiconomyMetaFactory.deployWithFactory.selector, nexusAccountFactory, factoryData);

        // 3b) Bridge using the module to destination (use full amount for bridge)
        uint256 bridgeAmount = 100_000; // 0.1 USDC for bridge (using full amount since no swap)
        uint256 relayerFeePct = 5e15; // 0.5%
        uint256 nonce = 0;
        bytes memory bridgeSignature = createBridgeSignature(bridgeAmount, relayerFeePct, expectedAddress, expectedAddress, nonce);
        bytes memory bridgeCall = abi.encodeWithSelector(
            AutoBridgeModule.bridge.selector,
            bridgeAmount,
            relayerFeePct,
            expectedAddress,
            expectedAddress, // recievingNexusAccount - same as source for now
            nonce,
            bridgeSignature
        );

        // Build aggregate3 calls (only deploy + bridge, no swap)
        IMulticall3.Call3[] memory calls = new IMulticall3.Call3[](2);
        calls[0] = IMulticall3.Call3({ target: biconomyMetaFactory, allowFailure: true, callData: deployCall });
        calls[1] = IMulticall3.Call3({ target: autoBridgeModule, allowFailure: true, callData: bridgeCall });

        IMulticall3(MULTICALL3).aggregate3(calls);

        deployedAccount = expectedAddress;
        console2.log("Multicall executed: deployed (with both modules) and bridged (swap skipped due to testnet liquidity).");
    }

    function deployNexusAccount() internal {
        console2.log("\n--- Deploying Nexus Account ---");

        // Build executor install config for bootstrap
        AutoBridgeModule.ConfigInput[] memory configs = new AutoBridgeModule.ConfigInput[](1);
        configs[0] = AutoBridgeModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            sourceTokenAddress: BASE_SEPOLIA_USDC,
            destinationChainId: ARBITRUM_SEPOLIA_CHAINID
        });
        uint256 configHash = uint256(keccak256(abi.encode(configs)));

        bytes memory executorInstallData = abi.encode(configHash);
        BootstrapConfig[] memory validators = new BootstrapConfig[](0);
        BootstrapConfig[] memory executors = BootstrapLib.createArrayConfig(autoBridgeModule, executorInstallData);
        BootstrapConfig memory hook = BootstrapLib.createSingleConfig(address(0), "");

        address[] memory attesters = new address[](1);
        attesters[0] = owner;
        RegistryConfig memory registryConfig = RegistryConfig({ registry: IERC7484(mockRegistry), attesters: attesters, threshold: 1 });

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

        bytes32 salt = keccak256("nexus-across-deployment-v1");
        address payable expectedAddress = NexusAccountFactory(nexusAccountFactory).computeAccountAddress(initData, salt);
        console2.log("Expected Account Address:", expectedAddress);

        bytes memory factoryData = abi.encodeWithSelector(NexusAccountFactory.createAccount.selector, initData, salt);

        deployedAccount = BiconomyMetaFactory(biconomyMetaFactory).deployWithFactory(nexusAccountFactory, factoryData);

        console2.log("Nexus Account deployed at:", deployedAccount);
        require(deployedAccount == expectedAddress, "Account address mismatch");
        require(deployedAccount.code.length > 0, "Account not deployed");

        bool isInitialized = AutoBridgeModule(autoBridgeModule).isInitialized(deployedAccount);
        require(isInitialized, "AutoBridge module not initialized");
        console2.log("AutoBridge module initialized:", isInitialized);
    }

    function fundAndBridge() internal {
        console2.log("\n--- Funding Account (USDC) and Executing Bridge ---");

        IERC20 usdc = IERC20(BASE_SEPOLIA_USDC);
        uint256 relayerUsdc = usdc.balanceOf(authorizedRelayer);
        uint256 amountUsdc = 50_000; // 0.05 USDC (6 decimals)

        console2.log("Relayer:", authorizedRelayer);
        console2.log("Relayer USDC balance:", relayerUsdc);
        require(relayerUsdc >= amountUsdc, "Insufficient relayer USDC");

        bool xfer = usdc.transfer(deployedAccount, amountUsdc);
        require(xfer, "USDC transfer failed");
        console2.log("Funded deployed account with USDC:", amountUsdc);

        uint256 bridgeAmount = amountUsdc;
        uint256 relayerFeePct = 5e15; // 0.5%
        uint256 nonce = 0;

        bytes memory signature = createBridgeSignature(bridgeAmount, relayerFeePct, deployedAccount, deployedAccount, nonce);

        try AutoBridgeModule(autoBridgeModule).bridge(bridgeAmount, relayerFeePct, deployedAccount, deployedAccount, nonce, signature) {
            console2.log("Bridge transaction submitted via AutoBridgeModule (USDC)");
        } catch Error(string memory reason) {
            console2.log("Bridge FAILED with error:", reason);
        } catch (bytes memory lowLevelData) {
            console2.log("Bridge FAILED with low-level error:");
            console2.logBytes(lowLevelData);
        }
    }

    function createBridgeSignature(uint256 amount, uint256 relayerFeePct, address nexusAccount, address recievingNexusAccount, uint256 nonce) internal view returns (bytes memory) {
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, amount, relayerFeePct, nexusAccount, recievingNexusAccount, nonce));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(getBroadcasterPrivateKey(), ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function createSwapSignature(address inputToken, uint256 amountIn, address nexusAccount, uint256 nonce) internal view returns (bytes memory) {
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, inputToken, amountIn, nexusAccount, nonce));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(getBroadcasterPrivateKey(), ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function logDeploymentSummary() internal view {
        console2.log("\n=== Deployment Summary ===");
        console2.log("Network: Base Sepolia (Chain ID:", BASE_SEPOLIA_CHAINID, ")");
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
        console2.log("  AutoBridge Module:", autoBridgeModule);
        console2.log("  AutoSwap Module:", address(autoSwapModule));
        console2.log("");
        console2.log("Deployed Account:");
        console2.log("  Address:", deployedAccount);
        console2.log("");
        console2.log("Across:");
        console2.log("  SpokePool (Base Sepolia):", BASE_SEPOLIA_SPOKEPOOL);
        console2.log("  Destination Chain (Arbitrum Sepolia):", ARBITRUM_SEPOLIA_CHAINID);
        console2.log("");
        console2.log("Uniswap:");
        console2.log("  SwapRouter02:", UNISWAP_V3_SWAP_ROUTER_02);
        console2.log("  QuoterV2:", UNISWAP_V3_QUOTER_V2);
        console2.log("");
        console2.log("=== Deployment Complete (Single-Tx Multicall: Deploy + Bridge) ===");
    }
}
