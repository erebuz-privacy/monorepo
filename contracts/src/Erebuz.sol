// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Erebuz
/// @notice Placeholder core contract for the Erebuz protocol.
contract Erebuz {
    string public constant NAME = "Erebuz";

    address public owner;

    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    error NotOwner();

    constructor() {
        owner = msg.sender;
    }

    function setOwner(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }
}
