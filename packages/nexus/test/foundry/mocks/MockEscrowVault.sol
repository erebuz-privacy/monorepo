// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IERC20 } from "forge-std/interfaces/IERC20.sol";

/**
 * @title MockEscrowVault
 * @notice Mock escrow contract for testing BondModule fund movements
 * @dev Simulates yield protocol vaults (ZyFAI, Giza, Cod3x, Sail)
 */
contract MockEscrowVault {
    string public name;
    address public token;
    uint256 public totalDeposits;

    mapping(address => uint256) public deposits;

    event Deposited(address indexed depositor, uint256 amount, uint256 timestamp);
    event Withdrawn(address indexed recipient, uint256 amount, uint256 timestamp);

    constructor(string memory _name, address _token) {
        name = _name;
        token = _token;
    }

    /**
     * @notice Deposit tokens into the escrow vault
     * @param amount Amount of tokens to deposit
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        deposits[msg.sender] += amount;
        totalDeposits += amount;

        emit Deposited(msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Withdraw tokens from the escrow vault
     * @param amount Amount of tokens to withdraw
     */
    function withdraw(uint256 amount) external {
        require(deposits[msg.sender] >= amount, "Insufficient balance");

        deposits[msg.sender] -= amount;
        totalDeposits -= amount;

        IERC20(token).transfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Get balance of the vault
     */
    function balance() external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Get deposit amount for a specific account
     */
    function getDeposit(address account) external view returns (uint256) {
        return deposits[account];
    }
}
