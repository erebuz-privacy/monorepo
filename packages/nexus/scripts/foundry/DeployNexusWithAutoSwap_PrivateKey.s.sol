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
import { AutoSwapModule } from "../../contracts/modules/executors/AutoSwap.sol";

// Mock contracts
import { MockRegistry } from "../../contracts/mocks/MockRegistry.sol";

// Interfaces
import { IERC7484 } from "../../contracts/interfaces/IERC7484.sol";
import { IERC20 } from "forge-std/interfaces/IERC20.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

/// @title DeployNexusWithAutoSwap_PrivateKey
/// @notice Deployment script for Nexus account with AutoSwap (Uniswap V3) module on Base Sepolia using private key
contract DeployNexusWithAutoSwap_PrivateKey is BaseWithPrivateKey {
    // Base Sepolia network configuration
    address public constant BASE_SEPOLIA_ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address public constant BASE_SEPOLIA_WETH = 0x4200000000000000000000000000000000000006;
    address public constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    // Uniswap V3 (Base Sepolia) per provided reference
    address public constant UNISWAP_V3_FACTORY = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address public constant UNISWAP_V3_SWAP_ROUTER_02 = 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4;
    address public constant UNISWAP_V3_QUOTER_V2 = 0xC5290058841028F1614F3A6F0F5816cAd0df5E27;

    // Chain IDs
    uint256 public constant BASE_SEPOLIA_CHAINID = 84532;

    // Deployment addresses (set during deployment)
    address public nexusImplementation;
    address public nexusAccountFactory;
    address public biconomyMetaFactory;
    address public k1Validator;
    AutoSwapModule public autoSwapModule;
    address public mockRegistry;
    address public nexusBootstrap;
    address public deployedAccount;

    // Owner/relayer configuration
    address public owner;
    address public authorizedRelayer;

    function run() external broadcast {
        console2.log("=== Deploying Nexus with AutoSwap Module on Base Sepolia (Private Key) ===");
        console2.log("Deployer Address:", broadcaster);
        console2.log("Deployer Private Key Set:", getBroadcasterPrivateKey() != 0);

        owner = broadcaster;
        authorizedRelayer = broadcaster;

        console2.log("Owner:", owner);
        console2.log("Authorized Relayer:", authorizedRelayer);

        deployCoreContracts();
        deployModules();
        configureAutoSwapModule();
        deployNexusAccount();
        fundAndSwap();
        logDeploymentSummary();
    }

    function deployCoreContracts() internal {
        console2.log("\n--- Deploying Core Contracts ---");

        k1Validator = address(new K1Validator());
        console2.log("K1Validator deployed at:", k1Validator);

        mockRegistry = address(new MockRegistry());
        console2.log("MockRegistry deployed at:", mockRegistry);

        nexusBootstrap = address(new NexusBootstrap(k1Validator, abi.encodePacked(owner)));
        console2.log("NexusBootstrap deployed at:", nexusBootstrap);

        nexusImplementation = address(new Nexus(
            BASE_SEPOLIA_ENTRYPOINT,
            k1Validator,
            abi.encodePacked(owner),
            new address[](0),
            new bytes[](0)
        ));
        console2.log("Nexus Implementation deployed at:", nexusImplementation);

        nexusAccountFactory = address(new NexusAccountFactory(nexusImplementation, owner));
        console2.log("NexusAccountFactory deployed at:", nexusAccountFactory);

        biconomyMetaFactory = address(new BiconomyMetaFactory(owner));
        console2.log("BiconomyMetaFactory deployed at:", biconomyMetaFactory);

        BiconomyMetaFactory(biconomyMetaFactory).addFactoryToWhitelist(nexusAccountFactory);
        console2.log("Added NexusAccountFactory to BiconomyMetaFactory whitelist");
    }

    function deployModules() internal {
        console2.log("\n--- Deploying Modules ---");

        autoSwapModule = new AutoSwapModule(
            authorizedRelayer,
            UNISWAP_V3_SWAP_ROUTER_02,
            UNISWAP_V3_QUOTER_V2,
            BASE_SEPOLIA_WETH,
            owner
        );
        console2.log("AutoSwapModule deployed at:", address(autoSwapModule));
    }

    function configureAutoSwapModule() internal {
        console2.log("\n--- Configuring AutoSwap Module ---");

        AutoSwapModule.ConfigInput[] memory configs = new AutoSwapModule.ConfigInput[](1);
        configs[0] = AutoSwapModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            destinationTokenAddress: BASE_SEPOLIA_WETH,   // swap into WETH by default
            defaultPoolFee: 3000,                    // 0.3%
            slippageBps: 10000                       // TEMP: 100% slippage for testnet
        });

        autoSwapModule.setConfig(configs);
        console2.log("AutoSwap configured for Base Sepolia");
        console2.log("  - Output token: WETH");
        console2.log("  - Fee: 3000");
        console2.log("  - Slippage bps: 10000 (TEMP for testnet)");

        uint256 configHash = uint256(keccak256(abi.encode(configs)));
        console2.log("Config Hash:", configHash);
    }

    function deployNexusAccount() internal {
        console2.log("\n--- Deploying Nexus Account ---");

        AutoSwapModule.ConfigInput[] memory configs = new AutoSwapModule.ConfigInput[](1);
        configs[0] = AutoSwapModule.ConfigInput({
            sourceChainId: BASE_SEPOLIA_CHAINID,
            destinationTokenAddress: BASE_SEPOLIA_WETH,
            defaultPoolFee: 3000,
            slippageBps: 10000
        });
        uint256 configHash = uint256(keccak256(abi.encode(configs)));

        bytes memory executorInstallData = abi.encode(configHash);
        BootstrapConfig[] memory validators = new BootstrapConfig[](0);
        BootstrapConfig[] memory executors = BootstrapLib.createArrayConfig(address(autoSwapModule), executorInstallData);
        BootstrapConfig memory hook = BootstrapLib.createSingleConfig(address(0), "");

        address[] memory attesters = new address[](1);
        attesters[0] = owner;
        RegistryConfig memory registryConfig = RegistryConfig({
            registry: IERC7484(mockRegistry),
            attesters: attesters,
            threshold: 1
        });

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

        bytes32 salt = keccak256("nexus-autoswap-deployment-v1");
        address payable expectedAddress = NexusAccountFactory(nexusAccountFactory).computeAccountAddress(initData, salt);
        console2.log("Expected Account Address:", expectedAddress);

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
        require(deployedAccount == expectedAddress, "Account address mismatch");
        require(deployedAccount.code.length > 0, "Account not deployed");

        bool isInitialized = autoSwapModule.isInitialized(deployedAccount);
        require(isInitialized, "AutoSwap module not initialized");
        console2.log("AutoSwap module initialized:", isInitialized);
    }

    function fundAndSwap() internal {
        console2.log("\n--- Funding Account (USDC) and Executing Swap USDC -> WETH ---");

        // Check pool existence first to avoid QuoterV2 reverts on testnet
        address pool = IUniswapV3Factory(UNISWAP_V3_FACTORY).getPool(
            BASE_SEPOLIA_USDC,
            BASE_SEPOLIA_WETH,
            10000 // fee tier configured above
        );
        console2.log("Uniswap V3 pool (USDC/WETH, 1%)", pool);
        if (pool == address(0)) {
            console2.log("ERROR: USDC/WETH 1% pool not found on Base Sepolia. Skipping swap.");
            return;
        }

        IERC20 usdc = IERC20(BASE_SEPOLIA_USDC);
        uint256 amountUsdc = 50_000; // 0.05 USDC (6 decimals)
        uint256 relayerUsdc = usdc.balanceOf(authorizedRelayer);
        console2.log("Relayer:", authorizedRelayer);
        console2.log("Relayer USDC balance:", relayerUsdc);
        require(relayerUsdc >= amountUsdc, "Insufficient relayer USDC");

        bool xfer = usdc.transfer(deployedAccount, amountUsdc);
        require(xfer, "USDC transfer failed");
        console2.log("Funded deployed account with USDC:", amountUsdc);

        // Sign swap as relayer
        uint256 nonce = 0;
        bytes memory signature = createSwapSignature(BASE_SEPOLIA_USDC, amountUsdc, deployedAccount, nonce);

        // Execute swap (no msg.value for ERC20)
        try autoSwapModule.swap(
            BASE_SEPOLIA_USDC,
            amountUsdc,
            deployedAccount,
            nonce,
            signature
        ) {
            console2.log("Swap transaction submitted via AutoSwapModule (USDC -> WETH)");
        } catch Error(string memory reason) {
            console2.log("Swap FAILED with error:", reason);
        } catch (bytes memory lowLevelData) {
            console2.log("Swap FAILED with low-level error:");
            console2.logBytes(lowLevelData);
        }
    }

    function createSwapSignature(
        address inputToken,
        uint256 amountIn,
        address nexusAccount,
        uint256 nonce
    ) internal view returns (bytes memory) {
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
        console2.log("  AutoSwap Module:", address(autoSwapModule));
        console2.log("");
        console2.log("Deployed Account:");
        console2.log("  Address:", deployedAccount);
        console2.log("");
        console2.log("Uniswap:");
        console2.log("  SwapRouter02:", UNISWAP_V3_SWAP_ROUTER_02);
        console2.log("  QuoterV2:", UNISWAP_V3_QUOTER_V2);
        console2.log("");
        console2.log("=== Deployment Complete ===");
    }
}


