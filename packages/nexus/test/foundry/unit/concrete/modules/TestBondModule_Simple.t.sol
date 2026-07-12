// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "forge-std/console2.sol";
import { BondModule } from "../../../../../contracts/modules/executors/BondModule.sol";
import { IERC20 } from "forge-std/interfaces/IERC20.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title TestBondModule_Simple
/// @notice Simplified tests for BondModule without account deployment
contract TestBondModule_Simple is Test {
    BondModule public bondModule;
    address public bondModuleTee;
    address public mockAccount;
    MockERC20 public mockToken;
    address public constant MOCK_VAULT = address(0x1234567890123456789012345678901234567890);

    uint256 public constant INITIAL_TOKEN_BALANCE = 1000 * 1e6; // 1000 tokens
    uint256 public constant ALLOWANCE_CAP = 500 * 1e6; // 500 tokens

    function setUp() public {
        // Create addresses
        bondModuleTee = makeAddr("bondModuleTee");
        mockAccount = makeAddr("mockAccount");

        // Deploy contracts
        bondModule = new BondModule(bondModuleTee, address(this));
        mockToken = new MockERC20("Mock USDC", "USDC", 6);

        // Fund mock account
        mockToken.mint(mockAccount, INITIAL_TOKEN_BALANCE);

        console2.log("BondModule:", address(bondModule));
        console2.log("Mock Account:", mockAccount);
        console2.log("TEE:", bondModuleTee);
    }

    /// @notice Test module installation
    function test_OnInstall() public {
        console2.log("\n=== Test: Module Installation ===");

        address[] memory tokenAddresses = new address[](1);
        uint256[] memory totalAmounts = new uint256[](1);
        tokenAddresses[0] = address(mockToken);
        totalAmounts[0] = ALLOWANCE_CAP;

        bytes memory installData = abi.encode(tokenAddresses, totalAmounts);

        // Install module (simulate account calling)
        vm.prank(mockAccount);
        bondModule.onInstall(installData);

        // Verify installation
        assertTrue(bondModule.isInitialized(mockAccount), "Not initialized");
        assertTrue(bondModule.isAgentModeActivated(mockAccount), "Agent mode not activated");
        assertEq(bondModule.getTokenAllowance(mockAccount, address(mockToken)), ALLOWANCE_CAP, "Wrong allowance");

        console2.log("[OK] Module installed successfully");
    }

    /// @notice Test activating agent mode with TEE attestation
    function test_ActivateAgentModeWithAttestation() public {
        console2.log("\n=== Test: Activate Agent Mode with Attestation ===");

        address[] memory tokenAddresses = new address[](1);
        uint256[] memory totalAmounts = new uint256[](1);
        tokenAddresses[0] = address(mockToken);
        totalAmounts[0] = ALLOWANCE_CAP * 2;

        uint256 nonce = 1;

        // Generate attestation
        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, mockAccount, tokenAddresses, totalAmounts, nonce)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);

        // Sign with TEE
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(keccak256(abi.encodePacked("bondModuleTee"))), ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Call activateAgentMode
        bondModule.activateAgentMode(mockAccount, tokenAddresses, totalAmounts, nonce, signature);

        // Verify
        assertEq(bondModule.getTokenAllowance(mockAccount, address(mockToken)), ALLOWANCE_CAP * 2, "Allowance not updated");
        assertTrue(bondModule.isAgentModeActivated(mockAccount), "Agent mode not activated");

        console2.log("[OK] Agent mode activated with attestation");
    }

    /// @notice Test disabling agent mode
    function test_DisableAgentMode() public {
        console2.log("\n=== Test: Disable Agent Mode ===");

        // First install
        test_OnInstall();

        // Disable agent mode
        vm.prank(mockAccount);
        bondModule.disableAgentMode();

        assertFalse(bondModule.isAgentModeActivated(mockAccount), "Agent mode should be disabled");

        console2.log("[OK] Agent mode disabled");
    }

    /// @notice Test enabling agent mode
    function test_EnableAgentMode() public {
        console2.log("\n=== Test: Enable Agent Mode ===");

        // Install and disable
        test_DisableAgentMode();

        // Re-enable
        vm.prank(mockAccount);
        bondModule.enableAgentMode();

        assertTrue(bondModule.isAgentModeActivated(mockAccount), "Agent mode should be enabled");

        console2.log("[OK] Agent mode enabled");
    }

    /// @notice Test clearing token allowances
    function test_ClearTokenAllowances() public {
        console2.log("\n=== Test: Clear Token Allowances ===");

        // Install first
        test_OnInstall();

        uint256 allowanceBefore = bondModule.getTokenAllowance(mockAccount, address(mockToken));
        assertGt(allowanceBefore, 0, "Allowance should be set");

        // Clear allowances
        address[] memory tokensToReset = new address[](1);
        tokensToReset[0] = address(mockToken);

        vm.prank(mockAccount);
        bondModule.clearTokenAllowances(tokensToReset);

        uint256 allowanceAfter = bondModule.getTokenAllowance(mockAccount, address(mockToken));
        assertEq(allowanceAfter, 0, "Allowance should be cleared");

        console2.log("[OK] Token allowances cleared");
    }

    /// @notice Test replay attack prevention
    function test_RevertWhen_ReplayAttack() public {
        console2.log("\n=== Test: Prevent Replay Attack ===");

        address[] memory tokenAddresses = new address[](1);
        uint256[] memory totalAmounts = new uint256[](1);
        tokenAddresses[0] = address(mockToken);
        totalAmounts[0] = ALLOWANCE_CAP;

        uint256 nonce = 1;

        // Generate attestation
        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, mockAccount, tokenAddresses, totalAmounts, nonce)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(keccak256(abi.encodePacked("bondModuleTee"))), ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // First call should succeed
        bondModule.activateAgentMode(mockAccount, tokenAddresses, totalAmounts, nonce, signature);
        console2.log("[OK] First call successful");

        // Second call with same signature should fail
        vm.expectRevert(BondModule.AttestationAlreadyUsed.selector);
        bondModule.activateAgentMode(mockAccount, tokenAddresses, totalAmounts, nonce, signature);

        console2.log("[OK] Replay attack prevented");
    }

    /// @notice Test invalid signature rejection
    function test_RevertWhen_InvalidSignature() public {
        console2.log("\n=== Test: Reject Invalid Signature ===");

        address[] memory tokenAddresses = new address[](1);
        uint256[] memory totalAmounts = new uint256[](1);
        tokenAddresses[0] = address(mockToken);
        totalAmounts[0] = ALLOWANCE_CAP;

        uint256 nonce = 1;

        // Generate attestation but sign with wrong key
        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, mockAccount, tokenAddresses, totalAmounts, nonce)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(keccak256(abi.encodePacked("attacker"))), ethSignedHash);
        bytes memory invalidSignature = abi.encodePacked(r, s, v);

        // Should revert
        vm.expectRevert(BondModule.InvalidAttestation.selector);
        bondModule.activateAgentMode(mockAccount, tokenAddresses, totalAmounts, nonce, invalidSignature);

        console2.log("[OK] Invalid signature rejected");
    }

    /// @notice Test module uninstallation
    function test_OnUninstall() public {
        console2.log("\n=== Test: Module Uninstallation ===");

        // Install first
        test_OnInstall();

        // Uninstall
        address[] memory tokenAddresses = new address[](1);
        tokenAddresses[0] = address(mockToken);
        bytes memory uninstallData = abi.encode(tokenAddresses);

        vm.prank(mockAccount);
        bondModule.onUninstall(uninstallData);

        // Verify uninstallation
        assertFalse(bondModule.isInitialized(mockAccount), "Should not be initialized");
        assertFalse(bondModule.isAgentModeActivated(mockAccount), "Agent mode should be deactivated");
        assertEq(bondModule.getTokenAllowance(mockAccount, address(mockToken)), 0, "Allowance should be zero");

        console2.log("[OK] Module uninstalled successfully");
    }

    /// @notice Test view functions
    function test_ViewFunctions() public {
        console2.log("\n=== Test: View Functions ===");

        // Install first
        test_OnInstall();

        // Test isModuleType
        assertTrue(bondModule.isModuleType(2), "Should be executor type");
        assertFalse(bondModule.isModuleType(1), "Should not be validator type");

        // Test isInitialized
        assertTrue(bondModule.isInitialized(mockAccount), "Should be initialized");
        assertFalse(bondModule.isInitialized(address(0x999)), "Random address should not be initialized");

        // Test isAgentModeActivated
        assertTrue(bondModule.isAgentModeActivated(mockAccount), "Agent mode should be activated");

        // Test getTokenAllowance
        assertEq(bondModule.getTokenAllowance(mockAccount, address(mockToken)), ALLOWANCE_CAP, "Wrong allowance");

        console2.log("[OK] View functions working correctly");
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
