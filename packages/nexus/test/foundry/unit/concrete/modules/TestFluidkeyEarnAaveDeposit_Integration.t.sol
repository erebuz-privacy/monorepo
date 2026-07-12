// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./BaseSepoliaSettings.t.sol";
import "../../../utils/Imports.sol";
import { AutoEarn } from "../../../../../contracts/modules/executors/AutoEarn.sol";
import { SENTINEL } from "sentinellist/SentinelList.sol";
import { IERC20 } from "forge-std/interfaces/IERC20.sol";
import "forge-std/console.sol";

/// @title TestFluidkeyEarnAaveDeposit_Integration
/// @notice Tests Fluidkey Earn Module with Aave deposits on Base Sepolia testnet
contract TestFluidkeyEarnAaveDeposit_Integration is BaseSepoliaSettings {
    address payable private preComputedAddress;
    AutoEarn private earnModule;
    MockPaymaster private paymaster;
    Vm.Wallet private user;
    address public relayer;
    IERC20 public usdc;
    IERC20 public aaveUSDC; // aToken

    uint256 public constant DEPOSIT_AMOUNT = 10 * 1e6; // 10 USDC (6 decimals)
    uint256 public constant MIN_DEPOSIT_THRESHOLD = 1 * 1e6; // $1 minimum

    /// @notice Modifier to check aToken balance changes
    /// @param account The account to check the balance for
    modifier checkAaveBalance(address account) {
        if (address(aaveUSDC).code.length > 0) {
            uint256 initialBalance = aaveUSDC.balanceOf(account);
            _;
            uint256 finalBalance = aaveUSDC.balanceOf(account);
            assertGt(finalBalance, initialBalance, "No aTokens received");
        } else {
            _;
        }
    }

    /// @notice Sets up the initial state for the tests
    function setUp() public {
        // Fork Base Sepolia testnet
        uint256 baseSepoliaFork = vm.createFork(getBaseSepoliaRpcUrl());
        vm.selectFork(baseSepoliaFork);
        vm.rollFork(BLOCK_NUMBER);
        init();

        console.log("DEFAULT_VALIDATOR_MODULE", address(DEFAULT_VALIDATOR_MODULE));
        console.log("AUTO_EARN_MODULE", address(AUTO_EARN_MODULE));
        user = createAndFundWallet("user", 1 ether);
        relayer = vm.addr(2);

        // Base Sepolia testnet addresses
        usdc = IERC20(USDC_ADDRESS);
        aaveUSDC = IERC20(AAVE_USDC_ADDRESS);

        // Distribute ether to accounts
        vm.deal(relayer, 100 ether);

        // Initialize Paymaster (following ColdAccess pattern)
        paymaster = new MockPaymaster(address(ENTRYPOINT), BUNDLER_ADDRESS);
        ENTRYPOINT.depositTo{ value: 10 ether }(address(paymaster));
        vm.deal(address(paymaster), 100 ether);

        preComputedAddress = payable(calculateAccountAddress(user.addr, address(VALIDATOR_MODULE)));
        vm.deal(preComputedAddress, 100 ether);

        deal(USDC_ADDRESS, preComputedAddress, 1000 * 1e6); // 1000 USDC
    }

    /// @notice Tests deploying Nexus with Earn Module enabled
    // function test_DeployNexusWithEarnModule() public {
    //     // Calculate config hash
    //     AutoEarn.ConfigInput[] memory configs = new AutoEarn.ConfigInput[](1);
    //     configs[0] = AutoEarn.ConfigInput({ chainId: 84532, token: USDC_ADDRESS, vault: AAVE_POOL_ADDRESS });
    //     uint256 configHash = uint256(keccak256(abi.encode(configs)));

    //     // Deploy Nexus account
    //     Nexus deployedNexus = deployNexus(user, 100 ether, address(VALIDATOR_MODULE));

    //     // Install Earn Module
    //     bytes memory installData = abi.encode(configHash);

    //     // Prepare execution to install module
    //     Execution[] memory executions = prepareSingleExecution(
    //         address(deployedNexus),
    //         0,
    //         abi.encodeWithSignature(
    //             "installModule(uint256,address,bytes)",
    //             2, // MODULE_TYPE_EXECUTOR
    //             address(earnModule),
    //             installData
    //         )
    //     );

    //     PackedUserOperation[] memory userOps = buildPackedUserOperation(
    //         user,
    //         deployedNexus,
    //         EXECTYPE_DEFAULT,
    //         executions,
    //         address(VALIDATOR_MODULE),
    //         0
    //     );

    //     measureAndLogGas("01::FluidkeyEarn::InstallModule::Nexus::Deployed::N/A", userOps);

    //     // Verify module is installed
    //     assertTrue(earnModule.isInitialized(address(deployedNexus)), "Module not initialized");
    //     assertEq(earnModule.accountConfig(address(deployedNexus)), configHash, "Config hash mismatch");
    // }

    /// @notice Tests auto-earn deposit to Aave using deployed Nexus with paymaster and withdraw functionality
    function test_DeployNexusWithEarnModule() public checkPaymasterBalance(address(paymaster)) {
        // Deploy and setup Nexus with Earn Module
        Nexus deployedNexus = deployNexusWithEarnModule(user);

        // Check initial aToken balance
        uint256 initialBalance = 0;
        if (address(aaveUSDC).code.length > 0) {
            initialBalance = aaveUSDC.balanceOf(address(deployedNexus));
        }

        // Simulate relayer calling autoEarn with proper signature
        uint256 nonce = 1;
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, USDC_ADDRESS, DEPOSIT_AMOUNT, address(deployedNexus), nonce));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        
        // Sign with relayer's private key (relayer is vm.addr(2))
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Call autoEarn with proper signature
        AUTO_EARN_MODULE.autoEarn(USDC_ADDRESS, DEPOSIT_AMOUNT, address(deployedNexus), nonce, signature);

        // Verify deposit was successful (only if aToken address is a contract on this fork)
        console.log("aaveUSDC code length", address(aaveUSDC).code.length);
        uint256 finalBalance = 0;
        if (address(aaveUSDC).code.length > 0) {
            finalBalance = aaveUSDC.balanceOf(address(deployedNexus));
            assertGt(finalBalance, initialBalance, "No aTokens received");
            assertGe(finalBalance, DEPOSIT_AMOUNT - 10, "Insufficient aTokens received"); // Account for rounding
        }

        // Test withdraw functionality using paymaster
        address withdrawRecipient = vm.addr(999);
        uint256 withdrawAmount = DEPOSIT_AMOUNT / 2; // Withdraw half

        // Prepare execution to directly call Aave pool withdraw function
        Execution[] memory executions = prepareSingleExecution(
            AAVE_POOL_ADDRESS,
            0,
            abi.encodeWithSignature("withdraw(address,uint256,address)", USDC_ADDRESS, withdrawAmount, withdrawRecipient)
        );

        // Build user operation with paymaster
        PackedUserOperation[] memory userOps = buildPackedUserOperation(
            user,
            deployedNexus,
            EXECTYPE_DEFAULT,
            executions,
            address(VALIDATOR_MODULE),
            0
        );

        // Add paymaster data
        userOps[0].paymasterAndData = generateAndSignPaymasterData(userOps[0], BUNDLER, paymaster);
        userOps[0].signature = signUserOp(user, userOps[0]);

        // Execute the withdraw operation
        measureAndLogGas("07::AavePool::Withdraw::WithPaymaster::N/A", userOps);

        // Verify withdraw was successful
        if (address(aaveUSDC).code.length > 0) {
            uint256 balanceAfterWithdraw = aaveUSDC.balanceOf(address(deployedNexus));
            assertLt(balanceAfterWithdraw, finalBalance, "aToken balance should decrease after withdraw");
        }
        
        // Verify USDC was received by recipient
        uint256 recipientBalance = usdc.balanceOf(withdrawRecipient);
        assertGe(recipientBalance, withdrawAmount - 10, "Insufficient USDC received by recipient"); // Account for rounding
    }

    /// @notice Tests auto-earn with signature verification
    function test_AutoEarn_WithSignature() public checkAaveBalance(preComputedAddress) {
        Nexus deployedNexus = deployNexusWithEarnModule(user);

        uint256 nonce = 1;
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, USDC_ADDRESS, DEPOSIT_AMOUNT, address(deployedNexus), nonce));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));

        // Sign with relayer's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Anyone can call with valid signature
        vm.prank(user.addr);
        earnModule.autoEarn(USDC_ADDRESS, DEPOSIT_AMOUNT, address(deployedNexus), nonce, signature);

        // Verify deposit (only if aToken address is a contract on this fork)
        if (address(aaveUSDC).code.length > 0) {
            uint256 aTokenBalance = aaveUSDC.balanceOf(address(deployedNexus));
            assertGe(aTokenBalance, DEPOSIT_AMOUNT - 10, "Insufficient aTokens received");
        }
    }

    /// @notice Tests deploying Nexus and auto-earning in one transaction with Paymaster
    function test_DeployAndAutoEarn_WithPaymaster() public checkAaveBalance(preComputedAddress) checkPaymasterBalance(address(paymaster)) {
        // Calculate config hash
        AutoEarn.ConfigInput[] memory configs = new AutoEarn.ConfigInput[](1);
        configs[0] = AutoEarn.ConfigInput({ sourceChainId: 84532, sourceTokenAddress: USDC_ADDRESS, vaultAddress: AAVE_POOL_ADDRESS });
        uint256 configHash = uint256(keccak256(abi.encode(configs)));

        // Prepare batch execution:
        // 1. Install Earn Module
        // 2. Approve USDC to Aave Pool
        // 3. Deposit to Aave
        Execution[] memory executions = new Execution[](3);

        executions[0] = Execution({
            target: preComputedAddress,
            value: 0,
            callData: abi.encodeWithSignature("installModule(uint256,address,bytes)", 2, address(earnModule), abi.encode(configHash))
        });

        executions[1] = Execution({
            target: USDC_ADDRESS,
            value: 0,
            callData: abi.encodeWithSignature("approve(address,uint256)", AAVE_POOL_ADDRESS, DEPOSIT_AMOUNT)
        });

        executions[2] = Execution({
            target: AAVE_POOL_ADDRESS,
            value: 0,
            callData: abi.encodeWithSignature("supply(address,uint256,address,uint16)", USDC_ADDRESS, DEPOSIT_AMOUNT, preComputedAddress, 0)
        });

        PackedUserOperation[] memory userOps = buildPackedUserOperation(
            user,
            Nexus(preComputedAddress),
            EXECTYPE_DEFAULT,
            executions,
            address(VALIDATOR_MODULE),
            0
        );

        console.log(address(paymaster).balance);
        userOps[0].initCode = buildInitCode(user.addr, address(VALIDATOR_MODULE));
        userOps[0].paymasterAndData = generateAndSignPaymasterData(userOps[0], BUNDLER, paymaster);
        userOps[0].signature = signUserOp(user, userOps[0]);
        console.log(address(paymaster).balance);

        measureAndLogGas("02::FluidkeyEarn::DeployAndDeposit::WithPaymaster::N/A", userOps);
    }

    // /// @notice Tests deploying Nexus with Earn Module and withdrawing using paymaster (ColdAccess pattern)
    // function test_DeployNexusWithEarnModule_WithPaymaster_ColdAccess() 
    //     public 
    //     checkAaveBalance(preComputedAddress) 
    //     checkPaymasterBalance(address(paymaster)) 
    // {
    //     // Calculate config hash
    //     AutoEarn.ConfigInput[] memory configs = new AutoEarn.ConfigInput[](1);
    //     configs[0] = AutoEarn.ConfigInput({ chainId: 84532, token: USDC_ADDRESS, vault: AAVE_POOL_ADDRESS });
    //     uint256 configHash = uint256(keccak256(abi.encode(configs)));

    //     // Prepare batch execution:
    //     // 1. Install Earn Module
    //     // 2. Approve USDC to Aave Pool
    //     // 3. Deposit to Aave
    //     // 4. Withdraw half to recipient
    //     Execution[] memory executions = new Execution[](4);

    //     executions[0] = Execution({
    //         target: preComputedAddress,
    //         value: 0,
    //         callData: abi.encodeWithSignature("installModule(uint256,address,bytes)", 2, address(AUTO_EARN_MODULE), abi.encode(configHash))
    //     });

    //     executions[1] = Execution({
    //         target: USDC_ADDRESS,
    //         value: 0,
    //         callData: abi.encodeWithSignature("approve(address,uint256)", AAVE_POOL_ADDRESS, DEPOSIT_AMOUNT)
    //     });

    //     executions[2] = Execution({
    //         target: AAVE_POOL_ADDRESS,
    //         value: 0,
    //         callData: abi.encodeWithSignature("supply(address,uint256,address,uint16)", USDC_ADDRESS, DEPOSIT_AMOUNT, preComputedAddress, 0)
    //     });

    //     address withdrawRecipient = vm.addr(999);
    //     executions[3] = Execution({
    //         target: address(AUTO_EARN_MODULE),
    //         value: 0,
    //         callData: abi.encodeWithSignature("withdrawFromVault(address,uint256,address)", USDC_ADDRESS, DEPOSIT_AMOUNT / 2, withdrawRecipient)
    //     });

    //     PackedUserOperation[] memory userOps = buildPackedUserOperation(
    //         user,
    //         Nexus(preComputedAddress),
    //         EXECTYPE_DEFAULT,
    //         executions,
    //         address(VALIDATOR_MODULE),
    //         0
    //     );

    //     userOps[0].initCode = buildInitCode(user.addr, address(VALIDATOR_MODULE));
    //     userOps[0].paymasterAndData = generateAndSignPaymasterData(userOps[0], BUNDLER, paymaster);
    //     userOps[0].signature = signUserOp(user, userOps[0]);

    //     measureAndLogGas("08::FluidkeyEarn::DeployAndDepositAndWithdraw::WithPaymaster::ColdAccess", userOps);

    //     // Verify withdraw recipient received USDC
    //     uint256 recipientBalance = usdc.balanceOf(withdrawRecipient);
    //     assertGe(recipientBalance, (DEPOSIT_AMOUNT / 2) - 10, "Insufficient USDC received by recipient");
    // }

    /// @notice Tests gas consumption comparison: EOA vs Nexus for Aave deposit
    function test_Gas_Comparison_EOA_vs_Nexus_AaveDeposit() public {
        // Test 1: EOA direct deposit
        vm.startPrank(relayer);
        deal(USDC_ADDRESS, relayer, DEPOSIT_AMOUNT);

        usdc.approve(AAVE_POOL_ADDRESS, DEPOSIT_AMOUNT);

        measureAndLogGasEOA(
            "03::Aave::supply::EOA::USDC::N/A",
            AAVE_POOL_ADDRESS,
            0,
            abi.encodeWithSignature("supply(address,uint256,address,uint16)", USDC_ADDRESS, DEPOSIT_AMOUNT, relayer, 0)
        );
        vm.stopPrank();

        // Test 2: Nexus with Earn Module
        Nexus deployedNexus = deployNexusWithEarnModule(user);

        Execution[] memory executions = new Execution[](2);

        executions[0] = Execution({
            target: USDC_ADDRESS,
            value: 0,
            callData: abi.encodeWithSignature("approve(address,uint256)", AAVE_POOL_ADDRESS, DEPOSIT_AMOUNT)
        });

        executions[1] = Execution({
            target: AAVE_POOL_ADDRESS,
            value: 0,
            callData: abi.encodeWithSignature("supply(address,uint256,address,uint16)", USDC_ADDRESS, DEPOSIT_AMOUNT, address(deployedNexus), 0)
        });

        PackedUserOperation[] memory userOps = buildPackedUserOperation(
            user,
            deployedNexus,
            EXECTYPE_DEFAULT,
            executions,
            address(VALIDATOR_MODULE),
            0
        );

        measureAndLogGas("04::Aave::supply::Nexus::USDC::N/A", userOps);
    }

    /// @notice Tests module uninstallation
    function test_UninstallEarnModule() public {
        Nexus deployedNexus = deployNexusWithEarnModule(user);

        // Verify module is installed
        assertTrue(earnModule.isInitialized(address(deployedNexus)), "Module not initialized");

        // Uninstall module
        Execution[] memory executions = prepareSingleExecution(
            address(deployedNexus),
            0,
            abi.encodeWithSignature(
                "uninstallModule(uint256,address,bytes)",
                2, // MODULE_TYPE_EXECUTOR
                address(earnModule),
                abi.encode(SENTINEL, bytes(""))
            )
        );

        PackedUserOperation[] memory userOps = buildPackedUserOperation(
            user,
            deployedNexus,
            EXECTYPE_DEFAULT,
            executions,
            address(VALIDATOR_MODULE),
            0
        );

        measureAndLogGas("05::FluidkeyEarn::UninstallModule::Nexus::N/A", userOps);

        // Verify module is uninstalled
        assertFalse(earnModule.isInitialized(address(deployedNexus)), "Module still initialized");
    }

    /// @notice Tests changing config hash
    function test_ChangeConfigHash() public {
        Nexus deployedNexus = deployNexusWithEarnModule(user);

        // Create new config
        AutoEarn.ConfigInput[] memory newConfigs = new AutoEarn.ConfigInput[](1);
        newConfigs[0] = AutoEarn.ConfigInput({
            sourceChainId: 84532,
            sourceTokenAddress: USDC_ADDRESS,
            vaultAddress: AAVE_POOL_ADDRESS // Same vault, but demonstrates config change
        });

        earnModule.setConfig(newConfigs);
        uint256 newConfigHash = uint256(keccak256(abi.encode(newConfigs)));

        // Change config hash via Nexus account
        Execution[] memory executions = prepareSingleExecution(
            address(earnModule),
            0,
            abi.encodeWithSignature("changeConfigHash(uint256)", newConfigHash)
        );

        PackedUserOperation[] memory userOps = buildPackedUserOperation(
            user,
            deployedNexus,
            EXECTYPE_DEFAULT,
            executions,
            address(VALIDATOR_MODULE),
            0
        );

        measureAndLogGas("06::FluidkeyEarn::ChangeConfigHash::Nexus::N/A", userOps);

        // Verify config hash changed
        assertEq(earnModule.accountConfig(address(deployedNexus)), newConfigHash, "Config hash not updated");
    }

    /// @notice Tests error: Module not initialized
    function test_Revert_ModuleNotInitialized() public {
        vm.expectRevert(abi.encodeWithSelector(AutoEarn.ModuleNotInitialized.selector, preComputedAddress));

        // Create proper signature for relayer call
        uint256 nonce = 1;
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, USDC_ADDRESS, DEPOSIT_AMOUNT, preComputedAddress, nonce));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(relayer);
        earnModule.autoEarn(USDC_ADDRESS, DEPOSIT_AMOUNT, preComputedAddress, nonce, signature);
    }

    /// @notice Tests error: Unauthorized relayer
    function test_Revert_NotAuthorized() public {
        Nexus deployedNexus = deployNexusWithEarnModule(user);

        address unauthorizedUser = vm.addr(999);

        vm.expectRevert(abi.encodeWithSelector(AutoEarn.NotAuthorized.selector, unauthorizedUser));

        // Create signature with unauthorized user (should fail)
        uint256 nonce = 1;
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, USDC_ADDRESS, DEPOSIT_AMOUNT, address(deployedNexus), nonce));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(999, ethSignedHash); // Sign with unauthorized user's key
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(unauthorizedUser);
        earnModule.autoEarn(USDC_ADDRESS, DEPOSIT_AMOUNT, address(deployedNexus), nonce, signature);
    }

    /// @notice Tests error: Signature already used
    function test_Revert_SignatureAlreadyUsed() public {
        Nexus deployedNexus = deployNexusWithEarnModule(user);

        uint256 nonce = 1;
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, USDC_ADDRESS, DEPOSIT_AMOUNT, address(deployedNexus), nonce));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // First call succeeds
        earnModule.autoEarn(USDC_ADDRESS, DEPOSIT_AMOUNT, address(deployedNexus), nonce, signature);

        // Second call with same signature should revert
        vm.expectRevert(AutoEarn.SignatureAlreadyUsed.selector);
        earnModule.autoEarn(USDC_ADDRESS, DEPOSIT_AMOUNT, address(deployedNexus), nonce, signature);
    }

    /*//////////////////////////////////////////////////////////////////////////
                                 HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////////////////*/

    /// @notice Helper to deploy Nexus with Earn Module installed
    function deployNexusWithEarnModule(Vm.Wallet memory wallet) internal returns (Nexus) {
        // Calculate config hash for AutoEarn module
        AutoEarn.ConfigInput[] memory configs = new AutoEarn.ConfigInput[](1);
        configs[0] = AutoEarn.ConfigInput({ sourceChainId: 84532, sourceTokenAddress: USDC_ADDRESS, vaultAddress: AAVE_POOL_ADDRESS });
        uint256 configHash = uint256(keccak256(abi.encode(configs)));

        bytes memory moduleInstallData = abi.encodePacked(wallet.addr);

        BootstrapConfig[] memory validators = BootstrapLib.createArrayConfig(address(VALIDATOR_MODULE), moduleInstallData);
        BootstrapConfig[] memory executors = BootstrapLib.createArrayConfig(address(AUTO_EARN_MODULE), abi.encode(configHash));
        BootstrapConfig memory hook = BootstrapLib.createSingleConfig(address(0), "");
        bytes memory saDeploymentIndex = "0";

        // Create initcode and salt to be sent to Factory
        bytes memory _initData = abi.encode(
            address(BOOTSTRAPPER),
            abi.encodeCall(
                BOOTSTRAPPER.initNexus,
                (
                    validators,
                    executors,
                    hook,
                    new BootstrapConfig[](0),
                    new BootstrapPreValidationHookConfig[](0),
                    RegistryConfig({ registry: REGISTRY, attesters: ATTESTERS, threshold: THRESHOLD })
                )
            )
        );
        bytes32 salt = keccak256(saDeploymentIndex);

        // Calculate the account address
        address payable accountAddress = FACTORY.computeAccountAddress(_initData, salt);

        // Deploy the account using the factory
        bytes memory factoryData = abi.encodeWithSelector(FACTORY.createAccount.selector, _initData, salt);
        META_FACTORY.deployWithFactory{ value: 0 }(address(FACTORY), factoryData);

        // Fund the account
        ENTRYPOINT.depositTo{ value: 100 ether }(accountAddress);

        // Deal USDC to the account for testing
        deal(USDC_ADDRESS, accountAddress, 1000 * 1e6); // 1000 USDC

        // Verify the account was deployed and AutoEarn module is initialized
        assertTrue(AUTO_EARN_MODULE.isInitialized(accountAddress), "AutoEarn module not initialized");

        return Nexus(accountAddress);
    }
}
