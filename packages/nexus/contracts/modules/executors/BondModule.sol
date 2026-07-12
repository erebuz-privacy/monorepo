// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import { IExecutor } from "../../interfaces/modules/IExecutor.sol";
import { IERC7579Account } from "../../interfaces/IERC7579Account.sol";
import { ExecutionMode, ExecType, CallType, CALLTYPE_SINGLE, CALLTYPE_BATCH, EXECTYPE_DEFAULT } from "../../lib/ModeLib.sol";
import { ExecLib } from "../../lib/ExecLib.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "forge-std/interfaces/IERC20.sol";

/**
 * @title BondModule
 * @notice ERC-7579 compliant Executor module for Nexus Smart Accounts
 * @dev This module allows verified agents to invest in yield-generating protocols (ZyFAI, Giza, Cod3x, Sail)
 * on behalf of users based on Bond Module TEE attestations.
 *
 * Flow:
 * 1. User deposits funds into their UnWallet smart account
 * 2. User installs module via onInstall, setting initial token allowance caps (no signature needed - it's their transaction)
 * 3. AgentModeActivated event is emitted for off-chain agents to listen
 * 4. Bond Module TEE calls executeBatchWithAttestation with percentage-based limits to move funds
 * 5. Account owner can disable agent mode anytime via disableAgentMode()
 * 6. Bond Module TEE can call activateAgentMode to update allowance caps at any time
 */
contract BondModule is IExecutor, Ownable {
    /*//////////////////////////////////////////////////////////////////////////
                            CONSTANTS & STORAGE
    //////////////////////////////////////////////////////////////////////////*/

    error ModuleNotInitialized(address account);
    error ModuleAlreadyInitialized(address account);
    error NotAuthorized(address tee);
    error AttestationAlreadyUsed();
    error InvalidAttestation();
    error ExecutionFailed();
    error InvalidAmount();
    error InsufficientAllowance();
    error ArrayLengthMismatch();
    error AgentModeNotActivated();
    error ExceededAllowedPercentage();
    error InvalidPercentage();

    /// @notice ERC-7579 Module Type ID for Executor
    uint256 public constant MODULE_TYPE_EXECUTOR = 2;

    /// @notice Address of the Bond Module TEE server that executes fund movements
    address public immutable bondModuleTeeServer;

    /// @notice Mapping to track initialized accounts
    mapping(address => bool) public initializedAccounts;

    /// @notice Mapping to track used attestations (prevents replay attacks)
    mapping(bytes32 => bool) public usedAttestations;

    /// @notice Mapping to store token allowances: account => token => allowedAmount
    /// @dev This tracks how much of each token the Bond Module can move
    mapping(address => mapping(address => uint256)) public tokenAllowances;

    /// @notice Mapping to track if agent mode is activated for an account
    mapping(address => bool) public agentModeActivated;

    event ModuleInitialized(
        address indexed account,
        address[] tokenAddresses,
        uint256[] allowances,
        uint256 timestamp
    );
    event ModuleUninitialized(
        address indexed account,
        address[] tokenAddresses,
        uint256 timestamp
    );
    event AgentModeActivated(
        address indexed account,
        address[] tokenAddresses,
        uint256[] totalAmounts,
        uint256 nonce,
        address activatedBy,
        uint256 timestamp
    );
    event AgentModeDisabled(
        address indexed account,
        uint256 timestamp
    );
    event AgentModeEnabled(
        address indexed account,
        uint256 timestamp
    );
    event TokenAllowancesCleared(
        address indexed account,
        address[] tokenAddresses,
        uint256[] previousAllowances,
        uint256 timestamp
    );
    event FundsExecuted(
        address indexed account,
        address indexed token,
        uint256 amount,
        uint256 percentageBps,
        uint256 balanceBefore,
        uint256 balanceAfter,
        uint256 nonce,
        bytes32 attestationHash,
        uint256 timestamp
    );

    /*//////////////////////////////////////////////////////////////////////////
                                 CONSTRUCTOR
    //////////////////////////////////////////////////////////////////////////*/

    /**
     * @param _bondModuleTeeServer Address of the Bond Module TEE server that executes transfers
     * @param _owner Owner of the contract (can manage configurations)
     */
    constructor(address _bondModuleTeeServer, address _owner) Ownable(_owner) {
        bondModuleTeeServer = _bondModuleTeeServer;
    }

    /*//////////////////////////////////////////////////////////////////////////
                            ERC-7579 IMPLEMENTATION
    //////////////////////////////////////////////////////////////////////////*/

    /**
     * @notice Installs the module and activates agent mode
     * @dev Called by the Nexus account when installing the module
     * No signature verification needed - the account owner is calling this directly
     * @param data Encoded: (address[] tokenAddresses, uint256[] totalAmounts)
     */
    function onInstall(bytes calldata data) external override {
        address account = msg.sender;

        if (isInitialized(account)) revert ModuleAlreadyInitialized(account);

        // Decode the installation data
        (address[] memory tokenAddresses, uint256[] memory totalAmounts) = abi.decode(data, (address[], uint256[]));

        // Mark account as initialized
        initializedAccounts[account] = true;

        emit ModuleInitialized(account, tokenAddresses, totalAmounts, block.timestamp);

        // Activate agent mode with the provided allowances
        _activateAgentMode(account, tokenAddresses, totalAmounts, 0, account);
    }

    /**
     * @notice Uninstalls the module and clears configuration
     * @dev Called by the Nexus account when uninstalling the module
     * @param data Encoded: (address[] tokenAddresses) - tokens to clear allowances for
     */
    function onUninstall(bytes calldata data) external override {
        address account = msg.sender;

        address[] memory tokenAddresses;

        // Decode token addresses to clear
        if (data.length > 0) {
            tokenAddresses = abi.decode(data, (address[]));

            // Clear all token allowances
            for (uint256 i = 0; i < tokenAddresses.length; i++) {
                delete tokenAllowances[account][tokenAddresses[i]];
            }
        } else {
            tokenAddresses = new address[](0);
        }

        // Clear account state
        delete initializedAccounts[account];
        delete agentModeActivated[account];

        emit ModuleUninitialized(account, tokenAddresses, block.timestamp);
    }

    /**
     * @notice Checks if the module matches a specific module type
     * @param moduleTypeId The module type ID to check
     * @return True if the module is of type Executor
     */
    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == MODULE_TYPE_EXECUTOR;
    }

    /**
     * @notice Checks if the module is initialized for a smart account
     * @param smartAccount The address to check
     * @return True if initialized
     */
    function isInitialized(address smartAccount) public view override returns (bool) {
        return initializedAccounts[smartAccount];
    }

    /*//////////////////////////////////////////////////////////////////////////
                                 MODULE LOGIC
    //////////////////////////////////////////////////////////////////////////*/

    /**
     * @notice Updates token allowance caps via Bond Module TEE attestation
     * @dev This function can be used to set new allowance caps at any time.
     * Initial activation happens during onInstall. This allows updating caps for continued operations.
     * Requires Bond Module TEE signature verification to prevent unauthorized allowance setting.
     * Can also reactivate agent mode if it was disabled by the account owner.
     * @param nexusAccount The smart account to update allowances for
     * @param tokenAddresses Array of token addresses to set allowances for
     * @param totalAmounts Array of amounts corresponding to each token
     * @param nonce A unique nonce for this attestation
     * @param bondModuleTeeSignature The signature from the Bond Module TEE server
     */
    function activateAgentMode(
        address nexusAccount,
        address[] calldata tokenAddresses,
        uint256[] calldata totalAmounts,
        uint256 nonce,
        bytes memory bondModuleTeeSignature
    ) external {
        // Verify the attestation signature from Bond Module TEE
        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, nexusAccount, tokenAddresses, totalAmounts, nonce)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);

        // SECURITY CHECK: Prevent replay attacks - ensure attestation hasn't been used
        if (usedAttestations[ethSignedHash]) revert AttestationAlreadyUsed();

        // SECURITY CHECK: Verify the signature is from the Bond Module TEE server
        address signer = ECDSA.recover(ethSignedHash, bondModuleTeeSignature);
        if (signer != bondModuleTeeServer) revert InvalidAttestation();

        // Mark attestation as used to prevent replay
        usedAttestations[ethSignedHash] = true;

        // Set the token allowances and activate agent mode
        _activateAgentMode(nexusAccount, tokenAddresses, totalAmounts, nonce, msg.sender);
    }

    /**
     * @notice Allows verified agents to execute batch transactions with percentage-based limits
     * @dev Verifies that the amount moved doesn't exceed allowedPercentageBps% of the account's token balance
     * @param nexusAccount The smart account to execute from
     * @param executionBatch The batch execution data
     * @param token The token address being moved
     * @param allowedPercentageBps The maximum percentage of balance that can be moved (in basis points, e.g., 1000 = 10%)
     * @param nonce A unique nonce for this attestation
     * @param bondModuleTeeSignature The signature from the Bond Module TEE server
     */
    function executeBatchWithAttestation(
        address nexusAccount,
        bytes calldata executionBatch,
        address token,
        uint256 allowedPercentageBps,
        uint256 nonce,
        bytes memory bondModuleTeeSignature
    ) external {
        // SECURITY CHECK: Account must be initialized
        if (!isInitialized(nexusAccount)) revert ModuleNotInitialized(nexusAccount);

        // SECURITY CHECK: Agent mode must be enabled (account owner can disable via disableAgentMode)
        if (!agentModeActivated[nexusAccount]) revert AgentModeNotActivated();

        // VALIDATION CHECK: Percentage must be valid (1-10000 bps = 0.01%-100%)
        if (allowedPercentageBps == 0 || allowedPercentageBps > 10000) revert InvalidPercentage();

        // SECURITY CHECK: Verify the attestation signature from Bond Module TEE
        bytes32 attestationHash = keccak256(
            abi.encodePacked(block.chainid, nexusAccount, token, allowedPercentageBps, nonce, executionBatch)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(attestationHash);

        // SECURITY CHECK: Prevent replay attacks - ensure attestation hasn't been used
        if (usedAttestations[ethSignedHash]) revert AttestationAlreadyUsed();

        // SECURITY CHECK: Verify the signature is from the Bond Module TEE server
        address signer = ECDSA.recover(ethSignedHash, bondModuleTeeSignature);
        if (signer != bondModuleTeeServer) revert InvalidAttestation();

        // Mark attestation as used to prevent replay
        usedAttestations[ethSignedHash] = true;

        // Get balance BEFORE execution
        IERC20 tokenContract = IERC20(token);
        uint256 balanceBefore = tokenContract.balanceOf(nexusAccount);

        // Execute the batch transaction
        IERC7579Account account = IERC7579Account(nexusAccount);
        ExecutionMode mode = _encodeExecutionMode(CALLTYPE_BATCH, EXECTYPE_DEFAULT);

        bytes[] memory result = account.executeFromExecutor(mode, executionBatch);
        if (result.length == 0) revert ExecutionFailed();

        // Get balance AFTER execution
        uint256 balanceAfter = tokenContract.balanceOf(nexusAccount);

        // Calculate how much was moved
        uint256 amountMoved = balanceBefore - balanceAfter;

        // Calculate maximum allowed amount based on percentage
        uint256 maxAllowedAmount = (balanceBefore * allowedPercentageBps) / 10000;

        // SECURITY CHECK: Verify that the amount moved doesn't exceed the allowed percentage
        if (amountMoved > maxAllowedAmount) revert ExceededAllowedPercentage();

        emit FundsExecuted(
            nexusAccount,
            token,
            amountMoved,
            allowedPercentageBps,
            balanceBefore,
            balanceAfter,
            nonce,
            ethSignedHash,
            block.timestamp
        );
    }

    /**
     * @notice Disables agent mode for the calling account
     * @dev ONLY the account itself can call this function (msg.sender must be the account address)
     * Allows account owner to pause agent operations without uninstalling the module.
     * Token allowances remain in storage but cannot be used when agent mode is disabled.
     * When disabled, executeBatchWithAttestation will revert with AgentModeNotActivated error.
     */
    function disableAgentMode() external {
        address account = msg.sender;
        if (!isInitialized(account)) revert ModuleNotInitialized(account);

        agentModeActivated[account] = false;

        emit AgentModeDisabled(account, block.timestamp);
    }

    /**
     * @notice Enables agent mode for the calling account
     * @dev ONLY the account itself can call this function (msg.sender must be the account address)
     * Allows account owner to resume agent operations after disabling.
     * Requires existing token allowances to be set.
     */
    function enableAgentMode() external {
        address account = msg.sender;
        if (!isInitialized(account)) revert ModuleNotInitialized(account);

        agentModeActivated[account] = true;

        emit AgentModeEnabled(account, block.timestamp);
    }

    /**
     * @notice Clears specific token allowances for the calling account
     * @dev ONLY the account itself can call this function (msg.sender must be the account address)
     * Allows account owner to remove specific token allowances without disabling agent mode entirely.
     * @param tokenAddresses Array of token addresses to clear
     */
    function clearTokenAllowances(address[] calldata tokenAddresses) external {
        address account = msg.sender;
        if (!isInitialized(account)) revert ModuleNotInitialized(account);

        // Store previous allowances before clearing
        uint256[] memory previousAllowances = new uint256[](tokenAddresses.length);
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            previousAllowances[i] = tokenAllowances[account][tokenAddresses[i]];
            delete tokenAllowances[account][tokenAddresses[i]];
        }

        emit TokenAllowancesCleared(account, tokenAddresses, previousAllowances, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////////////////
                                 VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////////////////*/

    /**
     * @notice Gets the token allowance for a specific account and token
     * @param account The account to check
     * @param token The token address to check
     * @return The allowed amount for the token
     */
    function getTokenAllowance(address account, address token) external view returns (uint256) {
        return tokenAllowances[account][token];
    }

    /**
     * @notice Checks if agent mode is activated for an account
     * @param account The account to check
     * @return True if agent mode is activated
     */
    function isAgentModeActivated(address account) external view returns (bool) {
        return agentModeActivated[account];
    }

    /**
     * @notice Returns the ABI type definition for BondModule installation/config data
     * @return configInputTypeData ABI-encoded type string describing expected config payload
     */
    function getConfigInputTypeData() external pure returns (string memory configInputTypeData) {
        return "tuple(address[] tokenAddresses,uint256[] totalAmounts)";
    }

    /*//////////////////////////////////////////////////////////////////////////
                                 HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////////////////*/

    /**
     * @notice Internal function to set token allowances and activate agent mode
     * @dev Used by both onInstall and activateAgentMode to avoid code duplication
     * @param account The account to set allowances for
     * @param tokenAddresses Array of token addresses
     * @param totalAmounts Array of amounts corresponding to each token
     * @param nonce The nonce used for this activation (0 for onInstall)
     * @param activatedBy The address that triggered the activation
     */
    function _activateAgentMode(
        address account,
        address[] memory tokenAddresses,
        uint256[] memory totalAmounts,
        uint256 nonce,
        address activatedBy
    ) internal {
        // Validate input
        if (tokenAddresses.length != totalAmounts.length) revert ArrayLengthMismatch();
        if (tokenAddresses.length == 0) revert InvalidAmount();

        // Set the token allowances
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            if (totalAmounts[i] == 0) revert InvalidAmount();
            tokenAllowances[account][tokenAddresses[i]] = totalAmounts[i];
        }

        // Mark agent mode as activated
        agentModeActivated[account] = true;

        // Emit event for off-chain agents to listen
        emit AgentModeActivated(account, tokenAddresses, totalAmounts, nonce, activatedBy, block.timestamp);
    }

    /**
     * @notice Encodes the execution mode for Nexus account execution
     * @param callType The type of call (single, batch, delegate)
     * @param execType The execution type (default, try)
     * @return mode The encoded execution mode
     */
    function _encodeExecutionMode(CallType callType, ExecType execType) private pure returns (ExecutionMode mode) {
        return ExecutionMode.wrap(bytes32(abi.encodePacked(callType, execType, bytes4(0x00000000), bytes22(0))));
    }

    /**
     * @notice Checks if an attestation has been used
     * @param attestationHash The hash of the attestation to check
     * @return True if the attestation has been used
     */
    function isAttestationUsed(bytes32 attestationHash) external view returns (bool) {
        return usedAttestations[attestationHash];
    }
}
