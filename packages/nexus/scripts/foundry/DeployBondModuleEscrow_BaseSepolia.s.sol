// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { console2 } from "forge-std/console2.sol";
import { BaseWithPrivateKey } from "./BaseWithPrivateKey.s.sol";
import { Vm } from "forge-std/Vm.sol";

// Core Nexus imports
import { Nexus } from "../../contracts/Nexus.sol";
import { NexusAccountFactory } from "../../contracts/factory/NexusAccountFactory.sol";
import { BiconomyMetaFactory } from "../../contracts/factory/BiconomyMetaFactory.sol";
import { NexusBootstrap, BootstrapConfig, BootstrapPreValidationHookConfig, RegistryConfig } from "../../contracts/utils/NexusBootstrap.sol";
import { BootstrapLib } from "../../contracts/lib/BootstrapLib.sol";
import { ModeLib } from "../../contracts/lib/ModeLib.sol";
import { ExecLib, Execution } from "../../contracts/lib/ExecLib.sol";

// Module imports
import { K1Validator } from "../../contracts/modules/validators/K1Validator.sol";
import { BondModule } from "../../contracts/modules/executors/BondModule.sol";

// Mock contracts
import { MockRegistry } from "../../contracts/mocks/MockRegistry.sol";
import { MockEscrowVault } from "../../test/foundry/mocks/MockEscrowVault.sol";

// Interface imports
import { IERC7484 } from "../../contracts/interfaces/IERC7484.sol";
import { IERC20 } from "forge-std/interfaces/IERC20.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// Multicall3 interface
interface IMulticall3 {
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }

    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData);

    struct Result {
        bool success;
        bytes returnData;
    }
}

/// @title DeployBondModuleEscrow_BaseSepolia
/// @notice Deploys Nexus account with BondModule and executes 30-30-40 fund distribution via TEE attestation
contract DeployBondModuleEscrow_BaseSepolia is BaseWithPrivateKey {

    // Base Sepolia configuration
    address public constant BASE_SEPOLIA_ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address public constant MULTICALL3 = 0xcA11bde05977b3631167028862bE2a173976CA11;

    // Deployment addresses
    address public nexusImplementation;
    address public nexusAccountFactory;
    address public biconomyMetaFactory;
    address public k1Validator;
    address public nexusBootstrap;
    address public mockRegistry;

    BondModule public bondModule;
    MockERC20 public mockToken;
    MockEscrowVault public escrowZyFAI;
    MockEscrowVault public escrowGiza;
    MockEscrowVault public escrowCod3x;

    address payable public deployedAccount;
    address public owner;
    address public teeServer;

    // Constants
    uint256 public constant INITIAL_TOKEN_BALANCE = 10000 * 1e6; // 10,000 tokens
    uint256 public constant ALLOWANCE_CAP = 10000 * 1e6; // 10,000 tokens

    // Percentage allocations in basis points
    uint256 public constant ALLOCATION_ZYFAI = 3000; // 30%
    uint256 public constant ALLOCATION_GIZA = 3000; // 30%
    uint256 public constant ALLOCATION_COD3X = 4000; // 40%
    uint256 public constant TOTAL_PERCENTAGE = 10000; // 100% in basis points

    constructor() {
        owner = broadcaster;
        teeServer = broadcaster; // Using deployer as TEE for testing
    }

    function run() external broadcast {
        console2.log("\n=== DEPLOYING BONDMODULE WITH NEXUS ACCOUNT ON BASE SEPOLIA ===");
        console2.log("Deployer Address:", broadcaster);
        console2.log("Owner:", owner);
        console2.log("TEE Server:", teeServer);
        console2.log("Chain ID:", block.chainid);

        // Step 1: Deploy core Nexus contracts
        deployCoreContracts();

        // Step 2: Deploy BondModule
        deployBondModule();

        // Step 3: Deploy mock token and escrow vaults
        deployTokenAndVaults();

        // Step 4: Pre-compute Nexus account address
        preComputeAccountAddress();

        // Step 5: Mint tokens to pre-computed address
        mintTokensToAccount();

        // Step 6: Deploy account + execute distribution in same tx
        deployAccountAndExecuteDistribution();

        // Step 7: Verify final distribution
        verifyDistribution();

        // Step 8: Log deployment summary
        logDeploymentSummary();

        console2.log("\n=== DEPLOYMENT COMPLETE ===");
    }

    function deployCoreContracts() internal {
        console2.log("\n[Step 1] Deploying Core Nexus Contracts...");

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

    function deployBondModule() internal {
        console2.log("\n[Step 2] Deploying BondModule...");
        bondModule = new BondModule(teeServer, owner);
        console2.log("BondModule deployed at:", address(bondModule));
    }

    function deployTokenAndVaults() internal {
        console2.log("\n[Step 3] Deploying Mock Token and Escrow Vaults...");

        // Deploy Mock ERC20 Token
        mockToken = new MockERC20("Test USDC", "USDC", 6);
        console2.log("Mock Token deployed at:", address(mockToken));

        // Deploy Escrow Vaults
        escrowZyFAI = new MockEscrowVault("ZyFAI Vault", address(mockToken));
        console2.log("ZyFAI Vault deployed at:", address(escrowZyFAI));

        escrowGiza = new MockEscrowVault("Giza Vault", address(mockToken));
        console2.log("Giza Vault deployed at:", address(escrowGiza));

        escrowCod3x = new MockEscrowVault("Cod3x Vault", address(mockToken));
        console2.log("Cod3x Vault deployed at:", address(escrowCod3x));
    }

    function preComputeAccountAddress() internal {
        console2.log("\n[Step 4] Pre-computing Nexus Account address...");

        // Prepare BondModule installation data
        address[] memory tokenAddresses = new address[](1);
        uint256[] memory totalAmounts = new uint256[](1);
        tokenAddresses[0] = address(mockToken);
        totalAmounts[0] = ALLOWANCE_CAP;
        bytes memory executorInstallData = abi.encode(tokenAddresses, totalAmounts);

        // Create bootstrap configurations
        BootstrapConfig[] memory validators = new BootstrapConfig[](0);
        BootstrapConfig[] memory executors = BootstrapLib.createArrayConfig(address(bondModule), executorInstallData);
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
        bytes32 salt = keccak256(abi.encodePacked("nexus-bondmodule-v1"));

        // Pre-compute the account address (before deployment!)
        deployedAccount = NexusAccountFactory(nexusAccountFactory).computeAccountAddress(initData, salt);
        console2.log("Pre-computed Account Address:", deployedAccount);
        console2.log("Account deployed yet?", deployedAccount.code.length > 0);
    }

    function deployAccountAndExecuteDistribution() internal {
        console2.log("\n[Step 6] Deploying account and executing distribution in ATOMIC SINGLE TX...");

        // Prepare BondModule installation data
        address[] memory tokenAddresses = new address[](1);
        uint256[] memory totalAmounts = new uint256[](1);
        tokenAddresses[0] = address(mockToken);
        totalAmounts[0] = ALLOWANCE_CAP;
        bytes memory executorInstallData = abi.encode(tokenAddresses, totalAmounts);

        // Create bootstrap configurations
        BootstrapConfig[] memory validators = new BootstrapConfig[](0);
        BootstrapConfig[] memory executors = BootstrapLib.createArrayConfig(address(bondModule), executorInstallData);
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

        // Use the same deterministic salt
        bytes32 salt = keccak256(abi.encodePacked("nexus-bondmodule-v1"));

        // Prepare factory deployment call data
        bytes memory factoryData = abi.encodeWithSelector(
            NexusAccountFactory.createAccount.selector,
            initData,
            salt
        );

        // Prepare batch execution data for fund distribution
        uint256 accountBalance = mockToken.balanceOf(deployedAccount);
        uint256 amountZyFAI = (accountBalance * ALLOCATION_ZYFAI) / 10000;
        uint256 amountGiza = (accountBalance * ALLOCATION_GIZA) / 10000;
        uint256 amountCod3x = (accountBalance * ALLOCATION_COD3X) / 10000;

        Execution[] memory executions = new Execution[](6);
        executions[0] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(IERC20.approve.selector, address(escrowZyFAI), amountZyFAI)
        });
        executions[1] = Execution({
            target: address(escrowZyFAI),
            value: 0,
            callData: abi.encodeWithSelector(MockEscrowVault.deposit.selector, amountZyFAI)
        });
        executions[2] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(IERC20.approve.selector, address(escrowGiza), amountGiza)
        });
        executions[3] = Execution({
            target: address(escrowGiza),
            value: 0,
            callData: abi.encodeWithSelector(MockEscrowVault.deposit.selector, amountGiza)
        });
        executions[4] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(IERC20.approve.selector, address(escrowCod3x), amountCod3x)
        });
        executions[5] = Execution({
            target: address(escrowCod3x),
            value: 0,
            callData: abi.encodeWithSelector(MockEscrowVault.deposit.selector, amountCod3x)
        });

        bytes memory executionBatch = abi.encode(executions);

        // Generate TEE attestation signature
        uint256 nonce = block.timestamp;
        uint256 allowedPercentageBps = TOTAL_PERCENTAGE;

        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, deployedAccount, address(mockToken), allowedPercentageBps, nonce, executionBatch)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(getBroadcasterPrivateKey(), ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Prepare executeBatchWithAttestation call data
        bytes memory batchExecutionData = abi.encodeWithSelector(
            BondModule.executeBatchWithAttestation.selector,
            deployedAccount,
            executionBatch,
            address(mockToken),
            allowedPercentageBps,
            nonce,
            signature
        );

        // Create Multicall3 calls array
        IMulticall3.Call3[] memory calls = new IMulticall3.Call3[](2);

        // Call 1: Deploy account via meta factory
        calls[0] = IMulticall3.Call3({
            target: biconomyMetaFactory,
            allowFailure: false,
            callData: abi.encodeWithSelector(
                BiconomyMetaFactory.deployWithFactory.selector,
                nexusAccountFactory,
                factoryData
            )
        });

        // Call 2: Execute batch distribution via BondModule
        calls[1] = IMulticall3.Call3({
            target: address(bondModule),
            allowFailure: false,
            callData: batchExecutionData
        });

        console2.log("Executing atomic deployment + distribution via Multicall3...");
        console2.log("Call 1: Deploy Nexus account");
        console2.log("Call 2: Execute 30-30-40 distribution (6 operations)");

        // Execute both calls atomically in single transaction
        IMulticall3.Result[] memory results = IMulticall3(MULTICALL3).aggregate3(calls);

        require(results[0].success, "Account deployment failed");
        require(results[1].success, "Batch execution failed");

        address actualAddress = abi.decode(results[0].returnData, (address));
        console2.log("Nexus Account deployed at:", actualAddress);
        require(actualAddress == deployedAccount, "Account address mismatch");
        require(deployedAccount.code.length > 0, "Account not deployed");

        // Verify BondModule is initialized
        bool isInitialized = bondModule.isInitialized(deployedAccount);
        require(isInitialized, "BondModule not initialized");
        console2.log("BondModule initialized:", isInitialized);
        console2.log("Agent mode activated:", bondModule.isAgentModeActivated(deployedAccount));
        console2.log("[SUCCESS] Atomic deployment + distribution completed in 1 tx!");
    }

    function mintTokensToAccount() internal {
        console2.log("\n[Step 5] Minting tokens to pre-computed address...");
        console2.log("Target address:", deployedAccount);
        console2.log("Address has code?", deployedAccount.code.length > 0);

        mockToken.mint(deployedAccount, INITIAL_TOKEN_BALANCE);
        console2.log("Minted", INITIAL_TOKEN_BALANCE, "tokens to", deployedAccount);
        console2.log("Pre-computed address token balance:", mockToken.balanceOf(deployedAccount));
    }

    function executeDistributionWithTeeAttestation() internal {
        console2.log("\nExecuting fund distribution via TEE attestation...");

        uint256 accountBalance = mockToken.balanceOf(deployedAccount);
        console2.log("Account balance before distribution:", accountBalance);

        // Calculate exact amounts based on percentages
        uint256 amountZyFAI = (accountBalance * ALLOCATION_ZYFAI) / 10000; // 30%
        uint256 amountGiza = (accountBalance * ALLOCATION_GIZA) / 10000; // 30%
        uint256 amountCod3x = (accountBalance * ALLOCATION_COD3X) / 10000; // 40%

        console2.log("Amount to ZyFAI (30%):", amountZyFAI);
        console2.log("Amount to Giza (30%):", amountGiza);
        console2.log("Amount to Cod3x (40%):", amountCod3x);

        // Prepare batch executions for all three vaults
        Execution[] memory executions = new Execution[](6); // 3 approvals + 3 deposits

        // ZyFAI: approve + deposit
        executions[0] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(IERC20.approve.selector, address(escrowZyFAI), amountZyFAI)
        });
        executions[1] = Execution({
            target: address(escrowZyFAI),
            value: 0,
            callData: abi.encodeWithSelector(MockEscrowVault.deposit.selector, amountZyFAI)
        });

        // Giza: approve + deposit
        executions[2] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(IERC20.approve.selector, address(escrowGiza), amountGiza)
        });
        executions[3] = Execution({
            target: address(escrowGiza),
            value: 0,
            callData: abi.encodeWithSelector(MockEscrowVault.deposit.selector, amountGiza)
        });

        // Cod3x: approve + deposit
        executions[4] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(IERC20.approve.selector, address(escrowCod3x), amountCod3x)
        });
        executions[5] = Execution({
            target: address(escrowCod3x),
            value: 0,
            callData: abi.encodeWithSelector(MockEscrowVault.deposit.selector, amountCod3x)
        });

        // Encode batch execution data
        bytes memory executionBatch = abi.encode(executions);

        // Generate TEE attestation signature
        uint256 nonce = block.timestamp;
        uint256 allowedPercentageBps = TOTAL_PERCENTAGE; // 100% of balance allowed

        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, deployedAccount, address(mockToken), allowedPercentageBps, nonce, executionBatch)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);

        // Sign with TEE private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(getBroadcasterPrivateKey(), ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        console2.log("Nonce:", nonce);
        console2.log("Allowed Percentage:", allowedPercentageBps, "bps (100%)");
        console2.log("Attestation hash:", vm.toString(attestationHash));

        // Execute batch distribution via TEE attestation
        console2.log("\nExecuting batch distribution...");
        bondModule.executeBatchWithAttestation(
            deployedAccount,
            executionBatch,
            address(mockToken),
            allowedPercentageBps,
            nonce,
            signature
        );

        console2.log("[SUCCESS] Batch distribution executed!");
    }

    function verifyDistribution() internal view {
        console2.log("\n[Step 7] Verifying final distribution...");

        uint256 finalAccountBalance = mockToken.balanceOf(deployedAccount);
        uint256 totalDistributed = escrowZyFAI.balance() + escrowGiza.balance() + escrowCod3x.balance();

        console2.log("\n=== Final Distribution Summary ===");
        console2.log("====================================");
        console2.log("ZyFAI Vault balance:", escrowZyFAI.balance(), "tokens");
        console2.log("ZyFAI percentage:", (escrowZyFAI.balance() * 100) / INITIAL_TOKEN_BALANCE, "%");
        console2.log("Giza Vault balance:", escrowGiza.balance(), "tokens");
        console2.log("Giza percentage:", (escrowGiza.balance() * 100) / INITIAL_TOKEN_BALANCE, "%");
        console2.log("Cod3x Vault balance:", escrowCod3x.balance(), "tokens");
        console2.log("Cod3x percentage:", (escrowCod3x.balance() * 100) / INITIAL_TOKEN_BALANCE, "%");
        console2.log("Account remaining balance:", finalAccountBalance, "tokens");
        console2.log("Total distributed:", totalDistributed, "tokens");
        console2.log("====================================");

        // Verify exact percentages
        require(escrowZyFAI.balance() == (INITIAL_TOKEN_BALANCE * ALLOCATION_ZYFAI) / 10000, "ZyFAI balance mismatch");
        require(escrowGiza.balance() == (INITIAL_TOKEN_BALANCE * ALLOCATION_GIZA) / 10000, "Giza balance mismatch");
        require(escrowCod3x.balance() == (INITIAL_TOKEN_BALANCE * ALLOCATION_COD3X) / 10000, "Cod3x balance mismatch");
        require(finalAccountBalance == 0, "Account should have 0 balance");

        console2.log("\n[SUCCESS] Distribution verified!");
    }

    function logDeploymentSummary() internal view {
        console2.log("\n=== Deployment Summary ===");
        console2.log("Network: Base Sepolia");
        console2.log("Chain ID:", block.chainid);
        console2.log("");
        console2.log("Core Contracts:");
        console2.log("  Nexus Implementation:", nexusImplementation);
        console2.log("  NexusAccountFactory:", nexusAccountFactory);
        console2.log("  BiconomyMetaFactory:", biconomyMetaFactory);
        console2.log("  K1Validator:", k1Validator);
        console2.log("  NexusBootstrap:", nexusBootstrap);
        console2.log("  MockRegistry:", mockRegistry);
        console2.log("");
        console2.log("BondModule:");
        console2.log("  BondModule:", address(bondModule));
        console2.log("  TEE Server:", teeServer);
        console2.log("");
        console2.log("Deployed Nexus Account:");
        console2.log("  Address:", deployedAccount);
        console2.log("  Initial Balance:", INITIAL_TOKEN_BALANCE, "tokens");
        console2.log("");
        console2.log("Mock Token & Vaults:");
        console2.log("  Mock Token:", address(mockToken));
        console2.log("  ZyFAI Vault:", address(escrowZyFAI));
        console2.log("    Balance:", escrowZyFAI.balance(), "tokens (30%)");
        console2.log("  Giza Vault:", address(escrowGiza));
        console2.log("    Balance:", escrowGiza.balance(), "tokens (30%)");
        console2.log("  Cod3x Vault:", address(escrowCod3x));
        console2.log("    Balance:", escrowCod3x.balance(), "tokens (40%)");
        console2.log("====================================");
    }
}

/// @notice Mock ERC20 token for testing
contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (msg.sender != from) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
