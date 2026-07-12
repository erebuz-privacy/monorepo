// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { Script } from "forge-std/Script.sol";

abstract contract BaseWithPrivateKey is Script {
    /// @dev Included to enable compilation of the script without environment variables.
    string internal constant TEST_MNEMONIC = "test test test test test test test test test test test junk";
    uint256 internal constant TEST_PRIVATE_KEY = 0x7cf73cff18de223ccfc1188c034f639768a90fd628393d0538fdb54d62b64695;

    /// @dev Needed for the deterministic deployments.
    bytes32 internal constant ZERO_SALT = bytes32(0);

    /// @dev The address of the transaction broadcaster.
    address internal broadcaster;

    /// @dev The private key of the transaction broadcaster.
    uint256 internal broadcasterPrivateKey;

    /// @dev Used to derive the broadcaster's address if $ETH_FROM is not defined.
    string internal mnemonic;

    /// @dev Initializes the transaction broadcaster with priority:
    ///
    /// 1. If $PRIVATE_KEY is defined, use it directly
    /// 2. If $ETH_FROM is defined, use it (requires private key to be set via --private-key flag)
    /// 3. If $MNEMONIC is defined, derive from mnemonic
    /// 4. Otherwise, use test private key
    ///
    /// The use case for $PRIVATE_KEY is to specify the private key directly via environment variable.
    /// The use case for $ETH_FROM is to specify the broadcaster address via command line.
    constructor() {
        // Try to get private key from environment variable first
        uint256 privateKey = vm.envOr({ name: "PRIVATE_KEY", defaultValue: uint256(0) });
        
        if (privateKey != 0) {
            // Use private key directly
            broadcasterPrivateKey = privateKey;
            broadcaster = vm.addr(privateKey);
        } else {
            // Fall back to ETH_FROM or mnemonic
            address from = vm.envOr({ name: "ETH_FROM", defaultValue: address(0) });
            if (from != address(0)) {
                broadcaster = from;
                // Note: For ETH_FROM, you need to provide the private key via --private-key flag
                // or set it in foundry.toml
            } else {
                // Use mnemonic
                mnemonic = vm.envOr({ name: "MNEMONIC", defaultValue: TEST_MNEMONIC });
                (broadcaster, broadcasterPrivateKey) = deriveRememberKey({ mnemonic: mnemonic, index: 0 });
            }
        }
    }

    modifier broadcast() {
        if (broadcasterPrivateKey != 0) {
            // Use the private key directly
            vm.startBroadcast(broadcasterPrivateKey);
        } else {
            // Use the broadcaster address (requires private key to be set elsewhere)
            vm.startBroadcast(broadcaster);
        }
        _;
        vm.stopBroadcast();
    }

    /// @dev Get the broadcaster's private key (useful for signing operations)
    function getBroadcasterPrivateKey() internal view returns (uint256) {
        return broadcasterPrivateKey;
    }

    /// @dev Get the broadcaster's address
    function getBroadcaster() internal view returns (address) {
        return broadcaster;
    }
}
