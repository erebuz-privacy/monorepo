// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/console2.sol";
import "../../../utils/TestHelper.t.sol";
import { BondModule } from "../../../../../contracts/modules/executors/BondModule.sol";
import { IERC20 } from "forge-std/interfaces/IERC20.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { PackedUserOperation } from "account-abstraction/interfaces/PackedUserOperation.sol";
import { ModeLib } from "../../../../../contracts/lib/ModeLib.sol";
import { ExecLib } from "../../../../../contracts/lib/ExecLib.sol";

/// @title TestBondModule
/// @notice Tests BondModule with Nexus Smart Accounts
contract TestBondModule is TestHelper {
    BondModule private bondModule;
    Vm.Wallet private user;
    Vm.Wallet private bondModuleTee;
    address payable private userAccountAddress;
    Nexus private userAccount;

    // Mock ERC20 token for testing
    MockERC20 private mockToken;
    address private constant MOCK_VAULT = address(0x1234567890123456789012345678901234567890);

    uint256 public constant INITIAL_TOKEN_BALANCE = 1000 * 1e6; // 1000 tokens (6 decimals)
    uint256 public constant ALLOWANCE_CAP = 500 * 1e6; // 500 tokens

    function setUp() public {
        // Simplified setup without full TestHelper environment
        setupPredefinedWallets();
        setupEntrypoint();

        // Deploy validator and mock modules
        DEFAULT_VALIDATOR_MODULE = new K1Validator();
        VALIDATOR_MODULE = new MockValidator();

        // Deploy factory contracts
        ACCOUNT_IMPLEMENTATION = new Nexus(
            address(ENTRYPOINT),
            address(DEFAULT_VALIDATOR_MODULE),
            abi.encodePacked(address(0xeEeEeEeE)),
            new address[](0),
            new bytes[](0)
        );
        FACTORY = new NexusAccountFactory(address(ACCOUNT_IMPLEMENTATION), address(FACTORY_OWNER.addr));
        META_FACTORY = new BiconomyMetaFactory(address(FACTORY_OWNER.addr));
        vm.prank(FACTORY_OWNER.addr);
        META_FACTORY.addFactoryToWhitelist(address(FACTORY));
        BOOTSTRAPPER = new NexusBootstrap(address(DEFAULT_VALIDATOR_MODULE), abi.encodePacked(address(0xa11ce)));
        REGISTRY = new MockRegistry();

        // Create wallets
        user = createAndFundWallet("user", 100 ether);
        bondModuleTee = createAndFundWallet("bondModuleTee", 1 ether);

        console2.log("User Address:", user.addr);
        console2.log("Bond Module TEE Address:", bondModuleTee.addr);

        // Deploy mock ERC20 token
        mockToken = new MockERC20("Mock USDC", "USDC", 6);
        console2.log("Mock Token deployed at:", address(mockToken));

        // Deploy BondModule with TEE server address
        bondModule = new BondModule(bondModuleTee.addr, address(this));
        console2.log("BondModule deployed at:", address(bondModule));

        // Deploy Nexus account for user
        userAccountAddress = payable(calculateAccountAddress(user.addr, address(DEFAULT_VALIDATOR_MODULE)));
        userAccount = deployNexus(user, 100 ether, address(DEFAULT_VALIDATOR_MODULE));
        console2.log("User Nexus Account deployed at:", address(userAccount));

        // Fund user account with tokens
        mockToken.mint(address(userAccount), INITIAL_TOKEN_BALANCE);
        console2.log("User account token balance:", mockToken.balanceOf(address(userAccount)));
    }

    /// @notice Test deploying Nexus account and installing BondModule
    function test_DeployAndInstallBondModule() public {
        console2.log("\n=== Test: Deploy and Install BondModule ===");

        // Prepare installation data
        address[] memory tokenAddresses = new address[](1);
        uint256[] memory totalAmounts = new uint256[](1);
        tokenAddresses[0] = address(mockToken);
        totalAmounts[0] = ALLOWANCE_CAP;

        bytes memory installData = abi.encode(tokenAddresses, totalAmounts);

        // Install BondModule
        vm.prank(address(userAccount));
        bondModule.onInstall(installData);

        // Verify installation
        assertTrue(bondModule.isInitialized(address(userAccount)), "Module not initialized");
        assertTrue(bondModule.isAgentModeActivated(address(userAccount)), "Agent mode not activated");
        assertEq(
            bondModule.getTokenAllowance(address(userAccount), address(mockToken)),
            ALLOWANCE_CAP,
            "Incorrect token allowance"
        );

        console2.log("[OK] BondModule installed successfully");
        console2.log("[OK] Token allowance set:", ALLOWANCE_CAP);
    }

    /// @notice Test activating agent mode with Bond Module TEE attestation
    function test_ActivateAgentModeWithAttestation() public {
        console2.log("\n=== Test: Activate Agent Mode with TEE Attestation ===");

        address[] memory tokenAddresses = new address[](1);
        uint256[] memory totalAmounts = new uint256[](1);
        tokenAddresses[0] = address(mockToken);
        totalAmounts[0] = ALLOWANCE_CAP * 2; // Double the cap

        uint256 nonce = 1;

        // Generate attestation hash
        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, address(userAccount), tokenAddresses, totalAmounts, nonce)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);

        // Sign with Bond Module TEE
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bondModuleTee.privateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Call activateAgentMode with attestation
        bondModule.activateAgentMode(
            address(userAccount),
            tokenAddresses,
            totalAmounts,
            nonce,
            signature
        );

        // Verify updated allowance
        assertEq(
            bondModule.getTokenAllowance(address(userAccount), address(mockToken)),
            ALLOWANCE_CAP * 2,
            "Allowance not updated"
        );
        assertTrue(bondModule.isAgentModeActivated(address(userAccount)), "Agent mode not activated");

        console2.log("[OK] Agent mode activated with TEE attestation");
        console2.log("[OK] Token allowance updated to:", ALLOWANCE_CAP * 2);
    }

    /// @notice Test executing funds with percentage-based limits
    function test_ExecuteBatchWithPercentageLimit() public {
        console2.log("\n=== Test: Execute Batch with Percentage Limit ===");

        // First install the module
        test_DeployAndInstallBondModule();

        uint256 balanceBefore = mockToken.balanceOf(address(userAccount));
        console2.log("Balance before execution:", balanceBefore);

        // Prepare execution: transfer 10% of balance to vault
        uint256 allowedPercentageBps = 1000; // 10%
        uint256 expectedAmount = (balanceBefore * allowedPercentageBps) / 10000;

        Execution[] memory executions = new Execution[](1);
        executions[0] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(
                IERC20.transfer.selector,
                MOCK_VAULT,
                expectedAmount
            )
        });

        bytes memory executionBatch = ExecLib.encodeBatch(executions);
        uint256 nonce = 1;

        // Generate attestation
        bytes32 attestationHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(userAccount),
                address(mockToken),
                allowedPercentageBps,
                nonce,
                executionBatch
            )
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);

        // Sign with Bond Module TEE
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bondModuleTee.privateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Execute batch
        bondModule.executeBatchWithAttestation(
            address(userAccount),
            executionBatch,
            address(mockToken),
            allowedPercentageBps,
            nonce,
            signature
        );

        uint256 balanceAfter = mockToken.balanceOf(address(userAccount));
        uint256 vaultBalance = mockToken.balanceOf(MOCK_VAULT);

        console2.log("Balance after execution:", balanceAfter);
        console2.log("Vault balance:", vaultBalance);
        console2.log("Amount moved:", balanceBefore - balanceAfter);

        // Verify execution
        assertEq(balanceAfter, balanceBefore - expectedAmount, "Incorrect balance after execution");
        assertEq(vaultBalance, expectedAmount, "Incorrect vault balance");

        console2.log("[OK] Funds executed successfully with 10% limit");
    }

    /// @notice Test that execution fails when exceeding percentage limit
    function test_RevertWhen_ExceedingPercentageLimit() public {
        console2.log("\n=== Test: Revert When Exceeding Percentage Limit ===");

        // First install the module
        test_DeployAndInstallBondModule();

        uint256 balanceBefore = mockToken.balanceOf(address(userAccount));

        // Try to transfer 50% but only allow 10%
        uint256 allowedPercentageBps = 1000; // 10%
        uint256 attemptedAmount = (balanceBefore * 5000) / 10000; // 50%

        Execution[] memory executions = new Execution[](1);
        executions[0] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(
                IERC20.transfer.selector,
                MOCK_VAULT,
                attemptedAmount
            )
        });

        bytes memory executionBatch = ExecLib.encodeBatch(executions);
        uint256 nonce = 2;

        // Generate attestation
        bytes32 attestationHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(userAccount),
                address(mockToken),
                allowedPercentageBps,
                nonce,
                executionBatch
            )
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);

        // Sign with Bond Module TEE
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bondModuleTee.privateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Expect revert
        vm.expectRevert(BondModule.ExceededAllowedPercentage.selector);
        bondModule.executeBatchWithAttestation(
            address(userAccount),
            executionBatch,
            address(mockToken),
            allowedPercentageBps,
            nonce,
            signature
        );

        console2.log("[OK] Correctly reverted when exceeding percentage limit");
    }

    /// @notice Test disabling and enabling agent mode
    function test_DisableAndEnableAgentMode() public {
        console2.log("\n=== Test: Disable and Enable Agent Mode ===");

        // Install module first
        test_DeployAndInstallBondModule();

        // Disable agent mode (only account can call this)
        vm.prank(address(userAccount));
        bondModule.disableAgentMode();

        assertFalse(bondModule.isAgentModeActivated(address(userAccount)), "Agent mode should be disabled");
        console2.log("[OK] Agent mode disabled");

        // Try to execute - should fail
        Execution[] memory executions = new Execution[](1);
        executions[0] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(IERC20.transfer.selector, MOCK_VAULT, 1e6)
        });

        bytes memory executionBatch = ExecLib.encodeBatch(executions);
        uint256 nonce = 3;

        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, address(userAccount), address(mockToken), uint256(1000), nonce, executionBatch)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bondModuleTee.privateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectRevert(BondModule.AgentModeNotActivated.selector);
        bondModule.executeBatchWithAttestation(address(userAccount), executionBatch, address(mockToken), 1000, nonce, signature);

        console2.log("[OK] Execution blocked when agent mode disabled");

        // Re-enable agent mode
        vm.prank(address(userAccount));
        bondModule.enableAgentMode();

        assertTrue(bondModule.isAgentModeActivated(address(userAccount)), "Agent mode should be enabled");
        console2.log("[OK] Agent mode re-enabled");
    }

    /// @notice Test clearing token allowances
    function test_ClearTokenAllowances() public {
        console2.log("\n=== Test: Clear Token Allowances ===");

        // Install module first
        test_DeployAndInstallBondModule();

        uint256 allowanceBefore = bondModule.getTokenAllowance(address(userAccount), address(mockToken));
        assertGt(allowanceBefore, 0, "Allowance should be set");

        // Clear token allowances (only account can call this)
        address[] memory tokensToReset = new address[](1);
        tokensToReset[0] = address(mockToken);

        vm.prank(address(userAccount));
        bondModule.clearTokenAllowances(tokensToReset);

        uint256 allowanceAfter = bondModule.getTokenAllowance(address(userAccount), address(mockToken));
        assertEq(allowanceAfter, 0, "Allowance should be cleared");

        console2.log("[OK] Token allowances cleared");
    }

    /// @notice Test replay attack prevention
    function test_RevertWhen_ReplayAttack() public {
        console2.log("\n=== Test: Prevent Replay Attack ===");

        // Install module first
        test_DeployAndInstallBondModule();

        // Prepare execution
        Execution[] memory executions = new Execution[](1);
        executions[0] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(IERC20.transfer.selector, MOCK_VAULT, 1e6)
        });

        bytes memory executionBatch = ExecLib.encodeBatch(executions);
        uint256 nonce = 4;
        uint256 allowedPercentageBps = 1000;

        // Generate attestation
        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, address(userAccount), address(mockToken), allowedPercentageBps, nonce, executionBatch)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bondModuleTee.privateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // First execution should succeed
        bondModule.executeBatchWithAttestation(
            address(userAccount),
            executionBatch,
            address(mockToken),
            allowedPercentageBps,
            nonce,
            signature
        );
        console2.log("[OK] First execution successful");

        // Second execution with same signature should fail
        vm.expectRevert(BondModule.AttestationAlreadyUsed.selector);
        bondModule.executeBatchWithAttestation(
            address(userAccount),
            executionBatch,
            address(mockToken),
            allowedPercentageBps,
            nonce,
            signature
        );

        console2.log("[OK] Replay attack prevented");
    }

    /// @notice Test invalid signature rejection
    function test_RevertWhen_InvalidSignature() public {
        console2.log("\n=== Test: Reject Invalid Signature ===");

        // Install module first
        test_DeployAndInstallBondModule();

        // Create a random wallet (not the TEE)
        Vm.Wallet memory attacker = createAndFundWallet("attacker", 1 ether);

        Execution[] memory executions = new Execution[](1);
        executions[0] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(IERC20.transfer.selector, MOCK_VAULT, 1e6)
        });

        bytes memory executionBatch = ExecLib.encodeBatch(executions);
        uint256 nonce = 5;
        uint256 allowedPercentageBps = 1000;

        // Generate attestation but sign with attacker's key
        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, address(userAccount), address(mockToken), allowedPercentageBps, nonce, executionBatch)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attacker.privateKey, ethSignedHash);
        bytes memory invalidSignature = abi.encodePacked(r, s, v);

        // Should revert with invalid attestation
        vm.expectRevert(BondModule.InvalidAttestation.selector);
        bondModule.executeBatchWithAttestation(
            address(userAccount),
            executionBatch,
            address(mockToken),
            allowedPercentageBps,
            nonce,
            invalidSignature
        );

        console2.log("[OK] Invalid signature rejected");
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
