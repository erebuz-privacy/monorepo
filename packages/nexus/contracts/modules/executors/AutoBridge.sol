// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import { IERC20 } from "forge-std/interfaces/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { IExecutor } from "../../interfaces/modules/IExecutor.sol";
import { IERC7579Account } from "../../interfaces/IERC7579Account.sol";
import { ExecutionMode, ExecType, CallType, CALLTYPE_SINGLE, EXECTYPE_DEFAULT } from "../../lib/ModeLib.sol";
import { ExecLib } from "../../lib/ExecLib.sol";

interface IWrappedNative {
    function deposit() external payable;
}

interface ISpokePool {
    function depositV3(
        address depositor,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId,
        address exclusiveRelayer,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        bytes calldata message
    ) external payable;

    function getCurrentTime() external view returns (uint32);
    function depositQuoteTimeBuffer() external view returns (uint32);
    function fillDeadlineBuffer() external view returns (uint32);
}

/**
 * @title AutoBridgeModule
 * @notice ERC-7579 compliant Executor module for Nexus Smart Accounts
 * @dev This module allows automatic bridging of a SPECIFIC configured token to a default chain using Across Protocol
 * Only the configured token can be bridged, but any amount can be specified
 */
contract AutoBridgeModule is IExecutor, Ownable {
    
    /*//////////////////////////////////////////////////////////////////////////
                            CONSTANTS & STORAGE
    //////////////////////////////////////////////////////////////////////////*/

    error EmptyConfigList();
    error ModuleNotInitialized(address account);
    error ModuleAlreadyInitialized(address account);
    error NotAuthorized(address relayer);
    error ConfigNotFound(uint256 chainId);
    error CannotRemoveSelf();
    error SignatureAlreadyUsed();
    error InvalidConfigHash();
    error ExecutionFailed();
    error InvalidSpokePool();
    error AlreadyOnDefaultChain();
    error InsufficientBalance();
    error InvalidAmount();

    uint256 public constant MODULE_TYPE_EXECUTOR = 2;
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice Address of the Across Protocol SpokePool
    address public immutable spokePool;

    /// @notice Address of the wrapped native token (like WETH)
    address public immutable wrappedNative;

    /// @dev authorizedRelayers -> bool
    mapping(address => bool) public authorizedRelayers;

    /// @dev config[configHash][originChainId] = BridgeConfig
    mapping(uint256 => mapping(uint256 => BridgeConfig)) public config;

    /// @dev accountConfig[smartAccount] = the configHash being used by that account
    mapping(address => uint256) public accountConfig;

    /// @dev executedHashes helps avoid replay attacks
    mapping(bytes32 => bool) public executedHashes;

    event AddAuthorizedRelayer(address indexed relayer);
    event RemoveAuthorizedRelayer(address indexed relayer);
    event ModuleInitialized(address indexed account);
    event ModuleUninitialized(address indexed account);
    event ConfigSet(uint256 indexed configHash, uint256 indexed originChainId, address token, uint256 destinationChainId);
    event BridgeExecuted(address indexed smartAccount, address indexed token, uint256 amount, uint256 destinationChainId);
    event ConfigHashChanged(address indexed account, uint256 oldConfigHash, uint256 newConfigHash);

    /*//////////////////////////////////////////////////////////////////////////
                                     STRUCTS
    //////////////////////////////////////////////////////////////////////////*/

    struct BridgeConfig {
        address token;              // The ONLY token that can be bridged from this chain
        uint256 destinationChainId;
    }

    struct ConfigInput {
        uint256 sourceChainId;
        address sourceTokenAddress; // The specific token to bridge (e.g., USDT only)
        uint256 destinationChainId;
    }

    /*//////////////////////////////////////////////////////////////////////////
                                 CONSTRUCTOR
    //////////////////////////////////////////////////////////////////////////*/

    constructor(address _authorizedRelayer, address _spokePool, address _wrappedNative, address _owner) Ownable(_owner) {
        if (_spokePool == address(0)) revert InvalidSpokePool();
        
        authorizedRelayers[_authorizedRelayer] = true;
        emit AddAuthorizedRelayer(_authorizedRelayer);
        
        spokePool = _spokePool;
        wrappedNative = _wrappedNative;
    }

    /*//////////////////////////////////////////////////////////////////////////
                                MODIFIERS
    //////////////////////////////////////////////////////////////////////////*/

    modifier onlyAuthorizedRelayer() {
        if (!authorizedRelayers[msg.sender] && msg.sender != owner()) {
            revert NotAuthorized(msg.sender);
        }
        _;
    }

    /*//////////////////////////////////////////////////////////////////////////
                            ERC-7579 IMPLEMENTATION
    //////////////////////////////////////////////////////////////////////////*/

    /**
     * @notice Installs the module with the provided configuration
     * @dev Called by the Nexus account when installing the module
     * @param data Encoded uint256 configHash
     */
    function onInstall(bytes calldata data) external override {
        address account = msg.sender;

        if (isInitialized(account)) revert ModuleAlreadyInitialized(account);

        uint256 configHash_ = abi.decode(data, (uint256));
        if (configHash_ == 0) revert InvalidConfigHash();

        accountConfig[account] = configHash_;

        emit ModuleInitialized(account);
        emit ConfigHashChanged(account, 0x0, configHash_);
    }

    /**
     * @notice Uninstalls the module and clears configuration
     * @dev Called by the Nexus account when uninstalling the module
     * @param data Optional data for cleanup (unused in this implementation)
     */
    function onUninstall(bytes calldata data) external override {
        address account = msg.sender;
        accountConfig[account] = 0;
        emit ModuleUninitialized(account);
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
     * @return True if initialized (configHash != 0)
     */
    function isInitialized(address smartAccount) public view override returns (bool) {
        return accountConfig[smartAccount] != 0;
    }

    /*//////////////////////////////////////////////////////////////////////////
                                     CONFIG
    //////////////////////////////////////////////////////////////////////////*/

    function addAuthorizedRelayer(address newRelayer) external onlyAuthorizedRelayer {
        authorizedRelayers[newRelayer] = true;
        emit AddAuthorizedRelayer(newRelayer);
    }

    function removeAuthorizedRelayer(address relayer) external onlyAuthorizedRelayer {
        if (relayer == msg.sender) revert CannotRemoveSelf();
        delete authorizedRelayers[relayer];
        emit RemoveAuthorizedRelayer(relayer);
    }

    function setConfig(ConfigInput[] calldata newConfigs) external onlyOwner {
        if (newConfigs.length == 0) revert EmptyConfigList();

        bytes32 rawHash = keccak256(abi.encode(newConfigs));
        uint256 configHash_ = uint256(rawHash);

        for (uint256 i = 0; i < newConfigs.length; i++) {
            uint256 _originChainId = newConfigs[i].sourceChainId;
            address _token = newConfigs[i].sourceTokenAddress;
            uint256 _destinationChainId = newConfigs[i].destinationChainId;

            config[configHash_][_originChainId] = BridgeConfig({
                token: _token,
                destinationChainId: _destinationChainId
            });

            emit ConfigSet(configHash_, _originChainId, _token, _destinationChainId);
        }
    }

    function changeConfigHash(uint256 newConfigHash) external {
        address account = msg.sender;
        if (!isInitialized(account)) revert ModuleNotInitialized(account);
        if (newConfigHash == 0) revert InvalidConfigHash();

        uint256 oldConfigHash = accountConfig[account];
        accountConfig[account] = newConfigHash;
        emit ConfigHashChanged(account, oldConfigHash, newConfigHash);
    }

    /*//////////////////////////////////////////////////////////////////////////
                                 READ METHODS
    //////////////////////////////////////////////////////////////////////////*/

    /**
     * @notice Returns the ConfigInput type structure for this module
     * @return configInputTypeData The ABI type definition for ConfigInput
     */
    function getConfigInputTypeData() external pure returns (string memory configInputTypeData) {
        return 'tuple[](uint256 sourceChainId,address sourceTokenAddress,uint256 destinationChainId)';
    }

    function getConfig(address account) external view returns (address token, uint256 destinationChainId) {
        uint256 configHash_ = accountConfig[account];
        if (configHash_ == 0) {
            return (address(0), 0);
        }

        BridgeConfig memory bridgeConfig = config[configHash_][block.chainid];
        return (bridgeConfig.token, bridgeConfig.destinationChainId);
    }

    function getConfigForChain(uint256 configHash_, uint256 chainId_) external view returns (address token, uint256 destinationChainId) {
        BridgeConfig memory bridgeConfig = config[configHash_][chainId_];
        return (bridgeConfig.token, bridgeConfig.destinationChainId);
    }

    /*//////////////////////////////////////////////////////////////////////////
                                     MODULE LOGIC
    //////////////////////////////////////////////////////////////////////////*/

    /**
     * @notice Bridge the configured token with a specified amount
     * @dev Only the configured token can be bridged, but relayer can specify any amount
     * @param amount The amount of tokens to bridge
     * @param relayerFeePct The relayer fee percentage (in 1e18 scale, e.g., 1e16 = 1%)
     * @param nexusAccount The Nexus account to bridge from
     * @param nonce Unique nonce to prevent replay attacks
     * @param signature Signature from authorized relayer
     */
    function bridge(
        uint256 amount,
        uint256 relayerFeePct,
        address nexusAccount,
        address recievingNexusAccount,
        uint256 nonce,
        bytes memory signature
    ) external payable {
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, amount, relayerFeePct, nexusAccount, recievingNexusAccount, nonce));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(hash);

        if (executedHashes[ethSignedHash]) revert SignatureAlreadyUsed();

        address relayer = ECDSA.recover(ethSignedHash, signature);
        if (!authorizedRelayers[relayer]) revert NotAuthorized(relayer);

        executedHashes[ethSignedHash] = true;
        _bridge(amount, relayerFeePct, nexusAccount, recievingNexusAccount);
    }

    function _bridge(uint256 amount, uint256 relayerFeePct, address nexusAccount, address recievingNexusAccount) private {
        if (!isInitialized(nexusAccount)) revert ModuleNotInitialized(nexusAccount);
        if (amount == 0) revert InvalidAmount();

        uint256 configHash_ = accountConfig[nexusAccount];
        BridgeConfig memory bridgeConfig = config[configHash_][block.chainid];
        
        if (bridgeConfig.token == address(0)) {
            revert ConfigNotFound(block.chainid);
        }

        if (block.chainid == bridgeConfig.destinationChainId) revert AlreadyOnDefaultChain();

        IERC7579Account account = IERC7579Account(nexusAccount);

        // Check if account has sufficient balance of the configured token
        uint256 balance;
        if (bridgeConfig.token == NATIVE_TOKEN) {
            balance = nexusAccount.balance;
        } else {
            balance = IERC20(bridgeConfig.token).balanceOf(nexusAccount);
        }

        if (balance < amount) revert InsufficientBalance();

        address inputToken;
        uint256 msgValue = 0;

        // Handle native token - send directly as ETH instead of wrapping
        if (bridgeConfig.token == NATIVE_TOKEN) {
            // Per Across docs: Send native ETH with msg.value, but specify WETH as token address
            inputToken = wrappedNative;
            msgValue = amount;
        } else {
            inputToken = bridgeConfig.token;
        }

        // Calculate output amount after fees
        uint256 outputAmount = (amount * (1e18 - relayerFeePct)) / 1e18;

        // Get timing parameters from SpokePool
        ISpokePool spoke = ISpokePool(spokePool);
        uint32 currentTime = spoke.getCurrentTime();
        uint32 fillDeadlineBuffer = spoke.fillDeadlineBuffer();

        // Approve SpokePool to spend tokens (not needed for native ETH)
        if (bridgeConfig.token != NATIVE_TOKEN) {
            bytes memory approveCallData = abi.encodeWithSelector(IERC20.approve.selector, spokePool, amount);
            bytes memory approveExecution = ExecLib.encodeSingle(inputToken, 0, approveCallData);

            ExecutionMode approveMode = _encodeExecutionMode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT);
            bytes[] memory approveResult = account.executeFromExecutor(approveMode, approveExecution);
            if (approveResult.length == 0) revert ExecutionFailed();
        }

        // Execute bridge via Across Protocol using depositV3
        bytes memory depositCallData = abi.encodeWithSelector(
            ISpokePool.depositV3.selector,
            nexusAccount,
            recievingNexusAccount,
            inputToken,
            address(0),
            amount,
            outputAmount,
            bridgeConfig.destinationChainId,
            address(0),
            currentTime,
            currentTime + fillDeadlineBuffer,
            0,
            ""
        );

        bytes memory depositExecution = ExecLib.encodeSingle(spokePool, msgValue, depositCallData);

        ExecutionMode depositMode = _encodeExecutionMode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT);
        bytes[] memory depositResult = account.executeFromExecutor{ value: msgValue }(depositMode, depositExecution);
        if (depositResult.length == 0) revert ExecutionFailed();

        emit BridgeExecuted(nexusAccount, bridgeConfig.token, amount, bridgeConfig.destinationChainId);
    }

    /*//////////////////////////////////////////////////////////////////////////
                                 HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////////////////*/

    /**
     * @notice Encodes the execution mode for Nexus account execution
     * @param callType The type of call (single, batch, delegate)
     * @param execType The execution type (default, try)
     * @return mode The encoded execution mode
     */
    function _encodeExecutionMode(CallType callType, ExecType execType) private pure returns (ExecutionMode mode) {
        return ExecutionMode.wrap(bytes32(abi.encodePacked(callType, execType, bytes4(0x00000000), bytes22(0))));
    }
}