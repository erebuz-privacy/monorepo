// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IEntryPoint } from "account-abstraction/interfaces/IEntryPoint.sol";
import { VerifyingPaymaster } from "account-abstraction/samples/VerifyingPaymaster.sol";

contract MockPaymaster is VerifyingPaymaster {
    constructor(address _entryPoint, address _signer) VerifyingPaymaster(IEntryPoint(_entryPoint), _signer) {}

    receive() external payable {
        require(msg.value > 0, "NO_VALUE");
        entryPoint.depositTo{value: msg.value}(address(this));
    }
}
