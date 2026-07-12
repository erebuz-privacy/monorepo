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
import { AutoSwapModule } from "../../contracts/modules/executors/AutoSwap.sol";
import { AutoBridgeModule } from "../../contracts/modules/executors/AutoBridge.sol";

// Mock contracts for testing
import { MockRegistry } from "../../contracts/mocks/MockRegistry.sol";
import { MockPaymaster } from "../../contracts/mocks/MockPaymaster.sol";

// Interface imports
import { IERC7484 } from "../../contracts/interfaces/IERC7484.sol";
import { IERC20 } from "forge-std/interfaces/IERC20.sol";

/// @title DeployBaseSepoliaOnly
/// @notice Deployment script for Nexus with AutoEarn, Swap, and Bridge modules on Base Sepolia only
/// @dev This script deploys the complete Biconomy Nexus stack with all modules on Base Sepolia
contract DeployBaseSepoliaOnly is BaseWithPrivateKey {
    
    // Base Sepolia configuration (from working scripts)
    address public constant BASE_SEPOLIA_ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address public constant BASE_SEPOLIA_WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC_ADDRESS = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address public constant AAVE_POOL_ADDRESS = 0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b;
    address public constant AAVE_USDC_ADDRESS = 0xf53B60F4006cab2b3C4688ce41fD5362427A2A66;
    address public constant UNISWAP_V3_FACTORY = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address public constant UNISWAP_V3_SWAP_ROUTER_02 = 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4;
    address public constant UNISWAP_V3_QUOTER_V2 = 0xC5290058841028F1614F3A6F0F5816cAd0df5E27;
    address public constant ACROSS_SPOKE_POOL = 0x82B564983aE7274c86695917BBf8C99ECb6F0F8F;
    address public constant MULTICALL3 = 0xcA11bde05977b3631167028862bE2a173976CA11;
    
    // Chain IDs
    uint256 public constant BASE_SEPOLIA_CHAINID = 84532;
    uint256 public constant ARBITRUM_SEPOLIA_CHAINID = 421614;
    
    // Deployment addresses (will be set during deployment)
    address public nexusImplementation;
    address public nexusAccountFactory;
    address public biconomyMetaFactory;
    address public k1Validator;
    address public autoEarnModule;
    AutoSwapModule public autoSwapModule;
    address public autoBridgeModule;
    address public mockRegistry;
    address public nexusBootstrap;
    address public deployedAccount;
    address public paymaster;
    
    // Owner configuration
    address public owner;
    address public authorizedRelayer;

    constructor() {
        // Set up owner and relayer addresses
        owner = broadcaster;
        authorizedRelayer = broadcaster;
    }

    function run() external broadcast {
        console2.log("=== DEPLOYING BICONOMY NEXUS STACK TO BASE SEPOLIA ===");
        console2.log("Deployer Address:", broadcaster);
        console2.log("Deployer Private Key Set:", getBroadcasterPrivateKey() != 0);
        console2.log("Owner:", owner);
        console2.log("Authorized Relayer:", authorizedRelayer);
        
        // Deploy core contracts
        deployCoreContracts();
        
        // Deploy all modules
        deployAllModules();
        
        // Configure all modules
        configureAllModules();
        
        // Check external contract states
        checkExternalContractStates();
        
        // Deploy Nexus account with all modules
        deployNexusAccountWithAllModules();
        
        // Log deployment summary
        logDeploymentSummary();
        
        // Save deployment data to JSON
        saveDeploymentToJson();
        
        console2.log("\n=== DEPLOYMENT COMPLETE ===");
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
    
    function deployAllModules() internal {
        console2.log("\n--- Deploying All Modules ---");
        
        // Deploy AutoEarn module
        autoEarnModule = address(new AutoEarn(
            authorizedRelayer,
            BASE_SEPOLIA_WETH,
            owner
        ));
        console2.log("AutoEarn Module deployed at:", autoEarnModule);
        
        // Deploy AutoSwap module
        autoSwapModule = new AutoSwapModule(
            authorizedRelayer,
            UNISWAP_V3_SWAP_ROUTER_02,
            UNISWAP_V3_QUOTER_V2,
            BASE_SEPOLIA_WETH,
            owner
        );
        console2.log("AutoSwap Module deployed at:", address(autoSwapModule));
        
        // Deploy AutoBridge module
        autoBridgeModule = address(new AutoBridgeModule(
            authorizedRelayer,
            ACROSS_SPOKE_POOL,
            BASE_SEPOLIA_WETH,
            owner
        ));
        console2.log("AutoBridge Module deployed at:", autoBridgeModule);
    }
    
    function configureAllModules() internal {
        console2.log("\n--- Configuring All Modules ---");
        
        // Configure AutoEarn module
        console2.log("Configuring AutoEarn module...");
        AutoEarn.ConfigInput[] memory autoEarnConfigs = new AutoEarn.ConfigInput[](1);
        autoEarnConfigs[0] = AutoEarn.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            sourceTokenAddress: USDC_ADDRESS,
            vaultAddress: AAVE_POOL_ADDRESS
        });
        
        AutoEarn(autoEarnModule).setConfig(autoEarnConfigs);
        console2.log("AutoEarn module configured for Base Sepolia");
        console2.log("  - Chain ID: 84532");
        console2.log("  - Token: USDC", USDC_ADDRESS);
        console2.log("  - Vault: Aave Pool", AAVE_POOL_ADDRESS);
        
        // Calculate and log config hash
        uint256 autoEarnConfigHash = uint256(keccak256(abi.encode(autoEarnConfigs)));
        console2.log("AutoEarn Config Hash:", autoEarnConfigHash);
        
        // Configure AutoSwap module
        console2.log("Configuring AutoSwap module...");
        AutoSwapModule.ConfigInput[] memory swapConfigs = new AutoSwapModule.ConfigInput[](1);
        swapConfigs[0] = AutoSwapModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            destinationTokenAddress: BASE_SEPOLIA_WETH,
            defaultPoolFee: 3000,
            slippageBps: 10000 // TEMP: 100% slippage for testnet
        });
        
        autoSwapModule.setConfig(swapConfigs);
        console2.log("AutoSwap module configured for Base Sepolia");
        console2.log("  - Output token: WETH");
        console2.log("  - Fee: 3000");
        console2.log("  - Slippage bps: 10000 (TEMP for testnet)");
        
        uint256 swapConfigHash = uint256(keccak256(abi.encode(swapConfigs)));
        console2.log("AutoSwap Config Hash:", swapConfigHash);
        
        // Configure AutoBridge module
        console2.log("Configuring AutoBridge module...");
        AutoBridgeModule.ConfigInput[] memory bridgeConfigs = new AutoBridgeModule.ConfigInput[](1);
        bridgeConfigs[0] = AutoBridgeModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            sourceTokenAddress: USDC_ADDRESS,
            destinationChainId: ARBITRUM_SEPOLIA_CHAINID
        });
        
        AutoBridgeModule(autoBridgeModule).setConfig(bridgeConfigs);
        console2.log("AutoBridge module configured for Base Sepolia");
        console2.log("  - Origin Chain: 84532");
        console2.log("  - Token: USDC");
        console2.log("  - Destination Chain: 421614");
        
        uint256 bridgeConfigHash = uint256(keccak256(abi.encode(bridgeConfigs)));
        console2.log("AutoBridge Config Hash:", bridgeConfigHash);
    }
    
    function checkExternalContractStates() internal view {
        console2.log("\n--- Checking External Contract States ---");
        
        // Check Aave pool state
        if (AAVE_POOL_ADDRESS.code.length == 0) {
            console2.log("WARNING: Aave Pool contract not deployed at", AAVE_POOL_ADDRESS);
        } else {
            console2.log("Aave Pool contract exists:", AAVE_POOL_ADDRESS);
        }
        
        if (AAVE_USDC_ADDRESS.code.length == 0) {
            console2.log("WARNING: aUSDC contract not deployed at", AAVE_USDC_ADDRESS);
        } else {
            console2.log("aUSDC contract exists:", AAVE_USDC_ADDRESS);
        }
        
        // Check Uniswap V3 contracts
        if (UNISWAP_V3_FACTORY.code.length == 0) {
            console2.log("WARNING: Uniswap V3 Factory not deployed at", UNISWAP_V3_FACTORY);
        } else {
            console2.log("Uniswap V3 Factory exists:", UNISWAP_V3_FACTORY);
        }
        
        if (UNISWAP_V3_SWAP_ROUTER_02.code.length == 0) {
            console2.log("WARNING: Uniswap V3 Router not deployed at", UNISWAP_V3_SWAP_ROUTER_02);
        } else {
            console2.log("Uniswap V3 Router exists:", UNISWAP_V3_SWAP_ROUTER_02);
        }
        
        // Check Across bridge
        if (ACROSS_SPOKE_POOL.code.length == 0) {
            console2.log("WARNING: Across SpokePool not deployed at", ACROSS_SPOKE_POOL);
        } else {
            console2.log("Across SpokePool exists:", ACROSS_SPOKE_POOL);
        }
        
        // Check USDC liquidity in Aave (only if USDC contract exists)
        if (USDC_ADDRESS.code.length > 0) {
            try IERC20(USDC_ADDRESS).balanceOf(AAVE_POOL_ADDRESS) returns (uint256 poolLiquidity) {
                console2.log("USDC balance in Aave Pool:", poolLiquidity);
                if (poolLiquidity == 0) {
                    console2.log("WARNING: Aave Pool has ZERO USDC liquidity!");
                }
            } catch {
                console2.log("WARNING: Could not check USDC balance in Aave Pool");
            }
        } else {
            console2.log("WARNING: USDC contract not deployed at", USDC_ADDRESS);
        }
    }
    
    function deployNexusAccountWithAllModules() internal {
        console2.log("\n--- Deploying Nexus Account with All Modules ---");
        
        // Calculate config hashes for all modules
        AutoEarn.ConfigInput[] memory autoEarnConfigs = new AutoEarn.ConfigInput[](1);
        autoEarnConfigs[0] = AutoEarn.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            sourceTokenAddress: USDC_ADDRESS,
            vaultAddress: AAVE_POOL_ADDRESS
        });
        uint256 autoEarnConfigHash = uint256(keccak256(abi.encode(autoEarnConfigs)));
        
        AutoSwapModule.ConfigInput[] memory swapConfigs = new AutoSwapModule.ConfigInput[](1);
        swapConfigs[0] = AutoSwapModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            destinationTokenAddress: BASE_SEPOLIA_WETH,
            defaultPoolFee: 3000,
            slippageBps: 10000
        });
        uint256 swapConfigHash = uint256(keccak256(abi.encode(swapConfigs)));
        
        AutoBridgeModule.ConfigInput[] memory bridgeConfigs = new AutoBridgeModule.ConfigInput[](1);
        bridgeConfigs[0] = AutoBridgeModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            sourceTokenAddress: USDC_ADDRESS,
            destinationChainId: ARBITRUM_SEPOLIA_CHAINID
        });
        uint256 bridgeConfigHash = uint256(keccak256(abi.encode(bridgeConfigs)));
        
        // Prepare module installation data
        bytes memory autoEarnInstallData = abi.encode(autoEarnConfigHash);
        bytes memory swapInstallData = abi.encode(swapConfigHash);
        bytes memory bridgeInstallData = abi.encode(bridgeConfigHash);
        
        // Create bootstrap configurations for all modules
        BootstrapConfig[] memory validators = new BootstrapConfig[](0);
        BootstrapConfig[] memory executors = new BootstrapConfig[](3);
        executors[0] = BootstrapLib.createSingleConfig(autoEarnModule, autoEarnInstallData);
        executors[1] = BootstrapLib.createSingleConfig(address(autoSwapModule), swapInstallData);
        executors[2] = BootstrapLib.createSingleConfig(autoBridgeModule, bridgeInstallData);
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
        bytes32 salt = keccak256(abi.encodePacked("nexus-base-sepolia-v1"));
        
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
        
        // Verify all modules are initialized
        bool autoEarnInitialized = AutoEarn(autoEarnModule).isInitialized(deployedAccount);
        bool swapInitialized = autoSwapModule.isInitialized(deployedAccount);
        bool bridgeInitialized = AutoBridgeModule(autoBridgeModule).isInitialized(deployedAccount);
        
        require(autoEarnInitialized, "AutoEarn module not initialized");
        require(swapInitialized, "AutoSwap module not initialized");
        require(bridgeInitialized, "AutoBridge module not initialized");
        
        console2.log("AutoEarn module initialized:", autoEarnInitialized);
        console2.log("AutoSwap module initialized:", swapInitialized);
        console2.log("AutoBridge module initialized:", bridgeInitialized);
    }
    
    function logDeploymentSummary() internal view {
        console2.log("\n=== Deployment Summary ===");
        console2.log("Network: Base Sepolia");
        console2.log("Chain ID: 84532");
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
        console2.log("  AutoSwap Module:", address(autoSwapModule));
        console2.log("  AutoBridge Module:", autoBridgeModule);
        console2.log("");
        console2.log("Deployed Account:");
        console2.log("  Address:", deployedAccount);
        console2.log("");
        console2.log("External Integrations:");
        console2.log("  USDC Token:", USDC_ADDRESS);
        console2.log("  Aave Pool:", AAVE_POOL_ADDRESS);
        console2.log("  aUSDC Token:", AAVE_USDC_ADDRESS);
        console2.log("  Uniswap V3 Factory:", UNISWAP_V3_FACTORY);
        console2.log("  Uniswap V3 Router:", UNISWAP_V3_SWAP_ROUTER_02);
        console2.log("  Across SpokePool:", ACROSS_SPOKE_POOL);
        console2.log("");
        console2.log("=== Deployment Complete ===");
    }
    
    /// @notice Save deployment data to JSON file
    function saveDeploymentToJson() internal {
        console2.log("\n--- Saving Deployment Data to JSON ---");
        
        string memory obj = "baseSepolia";
        
        vm.serializeUint(obj, "timestamp", block.timestamp);
        vm.serializeUint(obj, "blockNumber", block.number);
        vm.serializeUint(obj, "chainId", 84532);
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
        vm.serializeAddress(modulesObj, "autoEarnModule", autoEarnModule);
        vm.serializeAddress(modulesObj, "autoSwapModule", address(autoSwapModule));
        string memory modulesJson = vm.serializeAddress(modulesObj, "autoBridgeModule", autoBridgeModule);
        
        string memory configObj = "configuration";
        vm.serializeAddress(configObj, "usdcToken", USDC_ADDRESS);
        vm.serializeAddress(configObj, "aavePool", AAVE_POOL_ADDRESS);
        vm.serializeAddress(configObj, "aUSDCToken", AAVE_USDC_ADDRESS);
        vm.serializeAddress(configObj, "wethToken", BASE_SEPOLIA_WETH);
        vm.serializeAddress(configObj, "uniswapFactory", UNISWAP_V3_FACTORY);
        vm.serializeAddress(configObj, "uniswapRouter", UNISWAP_V3_SWAP_ROUTER_02);
        vm.serializeAddress(configObj, "uniswapQuoter", UNISWAP_V3_QUOTER_V2);
        string memory configJson = vm.serializeAddress(configObj, "acrossSpokePool", ACROSS_SPOKE_POOL);
        
        vm.serializeString(obj, "coreContracts", coreJson);
        vm.serializeString(obj, "modules", modulesJson);
        vm.serializeString(obj, "configuration", configJson);
        string memory finalJson = vm.serializeAddress(obj, "deployedAccount", deployedAccount);
        
        string memory rootPath = "./deployments.json";
        vm.writeJson(finalJson, rootPath);
        
        console2.log("Deployment data saved to:", rootPath);
        
        string memory broadcastPath = string.concat(
            "broadcast/DeployBaseSepoliaOnly.s.sol/", 
            vm.toString(block.chainid), 
            "/deployment-", 
            vm.toString(block.timestamp), 
            ".json"
        );
        vm.writeJson(finalJson, broadcastPath);
        
        console2.log("Backup saved to:", broadcastPath);
    }
}
