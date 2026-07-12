// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { NexusTest_Base } from "../../../utils/NexusTest_Base.t.sol";

/// @title BaseSepoliaSettings
/// @notice This contract sets up the constants required for Base Sepolia fork tests
contract BaseSepoliaSettings is NexusTest_Base {
    // Network Settings
    string public constant DEFAULT_BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
    uint256 public constant BLOCK_NUMBER = 18000000; // Recent block on Base Sepolia

    // Token Addresses on Base Sepolia
    address public constant USDC_ADDRESS = 0x036CbD53842c5426634e7929541eC2318f3dCF7e; // Base Sepolia USDC
    address public constant WETH_ADDRESS = 0x4200000000000000000000000000000000000006; // Wrapped ETH on Base

    // Aave V3 Addresses on Base Sepolia
    address public constant AAVE_POOL_ADDRESS = 0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b; // Aave V3 Pool
    address public constant AAVE_POOL_ADDRESSES_PROVIDER = 0x0d0b3b35e609D51Fa5b5Bb73AD3Df4e715c8a1c2;
    address public constant AAVE_USDC_ADDRESS = 0xf53B60F4006cab2b3C4688ce41fD5362427A2A66; // aBaseSepUSDC (aToken)

    // Additional Aave V3 contracts (useful for advanced testing)
    address public constant AAVE_ORACLE = 0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156;
    address public constant AAVE_POOL_DATA_PROVIDER = 0x19f6dFb32A23e5f4F072d1b5a7a00B25ac75bE96;

    /// @notice Retrieves the Base Sepolia RPC URL from the environment variable or defaults to the hardcoded URL
    /// @return rpcUrl The Base Sepolia RPC URL
    function getBaseSepoliaRpcUrl() internal view returns (string memory) {
        string memory rpcUrl = vm.envOr("BASE_SEPOLIA_RPC_URL", DEFAULT_BASE_SEPOLIA_RPC_URL);
        return rpcUrl;
    }

    /// @notice Helper to deal tokens to an address (useful for testing)
    /// @param token The token address to deal
    /// @param to The recipient address
    /// @param amount The amount to deal
    function dealToken(address token, address to, uint256 amount) internal {
        deal(token, to, amount);
    }
}
