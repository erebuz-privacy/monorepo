// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "forge-std/console2.sol";
import { BondModule } from "../../../../../contracts/modules/executors/BondModule.sol";
import { IERC20 } from "forge-std/interfaces/IERC20.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { MockEscrowVault } from "../../../mocks/MockEscrowVault.sol";
import { Execution } from "../../../../../contracts/types/DataTypes.sol";

/// @title TestBondModule_Escrow
/// @notice Advanced integration test for BondModule with escrow vaults and 30-30-40 allocation
contract TestBondModule_Escrow is Test {
    BondModule public bondModule;
    address public bondModuleTee;
    address public mockAccount;
    MockERC20 public mockToken;

    MockEscrowVault public escrowZyFAI;
    MockEscrowVault public escrowGiza;
    MockEscrowVault public escrowCod3x;

    uint256 public constant INITIAL_TOKEN_BALANCE = 10000 * 1e6; // 10,000 tokens
    uint256 public constant ALLOWANCE_CAP = 10000 * 1e6; // 10,000 tokens

    // Percentage allocations in basis points
    uint256 public constant ALLOCATION_ZYFAI = 3000; // 30%
    uint256 public constant ALLOCATION_GIZA = 3000; // 30%
    uint256 public constant ALLOCATION_COD3X = 4000; // 40%

    function setUp() public {
        console2.log("\n=== Setup: Advanced Escrow Integration Test ===");

        // Create addresses
        bondModuleTee = makeAddr("bondModuleTee");
        mockAccount = makeAddr("mockAccount");

        // Deploy contracts
        bondModule = new BondModule(bondModuleTee, address(this));
        mockToken = new MockERC20("Mock USDC", "USDC", 6);

        // Deploy escrow vaults (simulating yield protocols)
        escrowZyFAI = new MockEscrowVault("ZyFAI Vault", address(mockToken));
        escrowGiza = new MockEscrowVault("Giza Vault", address(mockToken));
        escrowCod3x = new MockEscrowVault("Cod3x Vault", address(mockToken));

        // Fund mock account
        mockToken.mint(mockAccount, INITIAL_TOKEN_BALANCE);

        console2.log("BondModule:", address(bondModule));
        console2.log("Mock Account:", mockAccount);
        console2.log("TEE:", bondModuleTee);
        console2.log("Mock Token:", address(mockToken));
        console2.log("ZyFAI Vault:", address(escrowZyFAI));
        console2.log("Giza Vault:", address(escrowGiza));
        console2.log("Cod3x Vault:", address(escrowCod3x));
        console2.log("Initial Account Balance:", mockToken.balanceOf(mockAccount));
    }

    /// @notice Test deploying escrow and distributing funds with 30-30-40 allocation
    /// @dev This test simulates the Bond Module TEE agent workflow by directly executing transfers
    function test_DistributeFundsToEscrowVaults_30_30_40() public {
        console2.log("\n=== Test: Distribute Funds to Escrow Vaults (30-30-40) ===");

        // Step 1: Install BondModule on the account
        address[] memory tokenAddresses = new address[](1);
        uint256[] memory totalAmounts = new uint256[](1);
        tokenAddresses[0] = address(mockToken);
        totalAmounts[0] = ALLOWANCE_CAP;

        bytes memory installData = abi.encode(tokenAddresses, totalAmounts);

        vm.prank(mockAccount);
        bondModule.onInstall(installData);

        console2.log("\n[Step 1] BondModule installed successfully");
        console2.log("Agent mode activated:", bondModule.isAgentModeActivated(mockAccount));

        // Step 2: Prepare batch executions for all three vaults
        uint256 accountBalance = mockToken.balanceOf(mockAccount);
        console2.log("\n[Step 2] Preparing batch executions");
        console2.log("Account balance before:", accountBalance);

        // Calculate exact amounts based on percentages
        uint256 amountZyFAI = (accountBalance * ALLOCATION_ZYFAI) / 10000; // 30%
        uint256 amountGiza = (accountBalance * ALLOCATION_GIZA) / 10000; // 30%
        uint256 amountCod3x = (accountBalance * ALLOCATION_COD3X) / 10000; // 40%

        console2.log("Amount to ZyFAI (30%):", amountZyFAI);
        console2.log("Amount to Giza (30%):", amountGiza);
        console2.log("Amount to Cod3x (40%):", amountCod3x);

        // Step 3: Simulate Bond Module TEE agent executing transfer to ZyFAI (30%)
        console2.log("\n[Step 3] Bond Module TEE Agent executing transfer to ZyFAI (30%)");

        vm.startPrank(mockAccount);
        mockToken.approve(address(escrowZyFAI), amountZyFAI);
        escrowZyFAI.deposit(amountZyFAI);
        vm.stopPrank();

        console2.log("[OK] Transferred to ZyFAI:", escrowZyFAI.balance());
        console2.log("Account balance after ZyFAI:", mockToken.balanceOf(mockAccount));

        // Step 4: Simulate Bond Module TEE agent executing transfer to Giza (30%)
        console2.log("\n[Step 4] Bond Module TEE Agent executing transfer to Giza (30%)");

        vm.startPrank(mockAccount);
        mockToken.approve(address(escrowGiza), amountGiza);
        escrowGiza.deposit(amountGiza);
        vm.stopPrank();

        console2.log("[OK] Transferred to Giza:", escrowGiza.balance());
        console2.log("Account balance after Giza:", mockToken.balanceOf(mockAccount));

        // Step 5: Simulate Bond Module TEE agent executing transfer to Cod3x (40%)
        console2.log("\n[Step 5] Bond Module TEE Agent executing transfer to Cod3x (40%)");

        vm.startPrank(mockAccount);
        mockToken.approve(address(escrowCod3x), amountCod3x);
        escrowCod3x.deposit(amountCod3x);
        vm.stopPrank();

        console2.log("[OK] Transferred to Cod3x:", escrowCod3x.balance());
        console2.log("Account balance after Cod3x:", mockToken.balanceOf(mockAccount));

        // Step 6: Verify final distribution
        console2.log("\n[Step 6] Verifying final distribution");

        uint256 finalAccountBalance = mockToken.balanceOf(mockAccount);
        uint256 totalDistributed = escrowZyFAI.balance() + escrowGiza.balance() + escrowCod3x.balance();

        console2.log("\nFinal Distribution Summary:");
        console2.log("====================================");
        console2.log("ZyFAI Vault balance:", escrowZyFAI.balance());
        console2.log("ZyFAI percentage:", (escrowZyFAI.balance() * 100) / INITIAL_TOKEN_BALANCE, "%");
        console2.log("Giza Vault balance:", escrowGiza.balance());
        console2.log("Giza percentage:", (escrowGiza.balance() * 100) / INITIAL_TOKEN_BALANCE, "%");
        console2.log("Cod3x Vault balance:", escrowCod3x.balance());
        console2.log("Cod3x percentage:", (escrowCod3x.balance() * 100) / INITIAL_TOKEN_BALANCE, "%");
        console2.log("Account remaining balance:", finalAccountBalance);
        console2.log("Total distributed:", totalDistributed);
        console2.log("====================================");

        // Assertions
        assertEq(escrowZyFAI.balance(), amountZyFAI, "ZyFAI vault balance mismatch");
        assertEq(escrowGiza.balance(), amountGiza, "Giza vault balance mismatch");
        assertEq(escrowCod3x.balance(), amountCod3x, "Cod3x vault balance mismatch");
        assertEq(finalAccountBalance + totalDistributed, INITIAL_TOKEN_BALANCE, "Total balance mismatch");

        console2.log("\n[OK] All funds distributed correctly with 30-30-40 allocation!");
    }

    /// @notice Test that account owner can disable agent mode to stop fund movements
    function test_AccountOwnerCanDisableAgentModeDuringDistribution() public {
        console2.log("\n=== Test: Account Owner Disables Agent Mode During Distribution ===");

        // Install module
        address[] memory tokenAddresses = new address[](1);
        uint256[] memory totalAmounts = new uint256[](1);
        tokenAddresses[0] = address(mockToken);
        totalAmounts[0] = ALLOWANCE_CAP;

        vm.prank(mockAccount);
        bondModule.onInstall(abi.encode(tokenAddresses, totalAmounts));

        console2.log("[Step 1] Module installed, agent mode active");

        // Account owner disables agent mode
        vm.prank(mockAccount);
        bondModule.disableAgentMode();

        console2.log("[Step 2] Account owner disabled agent mode");

        // Try to execute - should fail
        uint256 nonce = 1;
        Execution[] memory executions = new Execution[](1);
        executions[0] = Execution({
            target: address(mockToken),
            value: 0,
            callData: abi.encodeWithSelector(IERC20.transfer.selector, address(escrowZyFAI), 1000 * 1e6)
        });

        bytes memory executionBatch = abi.encode(executions);

        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, mockAccount, address(mockToken), uint256(1000), nonce, executionBatch)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(uint256(keccak256(abi.encodePacked("bondModuleTee"))), ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectRevert(BondModule.AgentModeNotActivated.selector);
        bondModule.executeBatchWithAttestation(mockAccount, executionBatch, address(mockToken), 1000, nonce, signature);

        console2.log("[OK] Execution blocked when agent mode is disabled");
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
