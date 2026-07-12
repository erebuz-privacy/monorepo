// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import { IERC20 } from "forge-std/interfaces/IERC20.sol";
import { IERC4626 } from "forge-std/interfaces/IERC4626.sol";
import { SentinelListLib, SENTINEL, ZERO_ADDRESS } from "sentinellist/SentinelList.sol";
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

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

/// @title Execution structure for Nexus accounts
struct Execution {
    address target;
    uint256 value;
    bytes callData;
}

/**
 * @title FluidkeyEarnModule
 * @notice ERC-7579 compliant Executor module for Nexus Smart Accounts
 * @dev This module allows Fluidkey to automatically deposit funds into an ERC-4626 vault
 * on behalf of users, using a new config layout to support multiple chainIds and config sets.
 * Originally based on Rhinestone's AutoSavings contract, adapted for Nexus compatibility.
 */
contract AutoEarn is IExecutor, Ownable {
    using SentinelListLib for SentinelListLib.SentinelList;

    /*//////////////////////////////////////////////////////////////////////////
                            CONSTANTS & STORAGE
    //////////////////////////////////////////////////////////////////////////*/

    error TooManyTokens();
    error EmptyConfigList();
    error ModuleNotInitialized(address account);
    error ModuleAlreadyInitialized(address account);
    error NotAuthorized(address relayer);
    error ConfigNotFound(address token);
    error CannotRemoveSelf();
    error SignatureAlreadyUsed();
    error InvalidConfigHash();
    error ExecutionFailed();

    uint256 internal constant MAX_TOKENS = 100;
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice ERC-7579 Module Type ID for Executor
    uint256 public constant MODULE_TYPE_EXECUTOR = 2;

    /// @notice Address of the wrapped native token (like WETH)
    address public immutable wrappedNative;

    /// @dev authorizedRelayers -> bool
    mapping(address => bool) public authorizedRelayers;

    /// @dev config[configHash][chainId][token] = vault
    mapping(uint256 => mapping(uint256 => mapping(address => address))) public config;

    /// @dev tokens[configHashChainId] is a SentinelList containing the set of tokens
    mapping(uint256 => SentinelListLib.SentinelList) private tokens;

    /// @dev accountConfig[smartAccount] = the configHash being used by that account
    mapping(address => uint256) public accountConfig;

    /// @dev executedHashes helps avoid replay attacks
    mapping(bytes32 => bool) public executedHashes;

    event AddAuthorizedRelayer(address indexed relayer);
    event RemoveAuthorizedRelayer(address indexed relayer);
    event ModuleInitialized(address indexed account);
    event ModuleUninitialized(address indexed account);
    event ConfigSet(uint256 indexed configHash, uint256 indexed chainId, address token);
    event AutoEarnExecuted(address indexed smartAccount, address indexed token, uint256 amountIn);
    event ConfigHashChanged(address indexed account, uint256 oldConfigHash, uint256 newConfigHash);

    /*//////////////////////////////////////////////////////////////////////////
                                     STRUCTS
    //////////////////////////////////////////////////////////////////////////*/

    struct ConfigInput {
        uint256 sourceChainId;
        address sourceTokenAddress;
        address vaultAddress;
    }

    struct ConfigWithToken {
        address token;
        address vault;
    }

    /*//////////////////////////////////////////////////////////////////////////
                                 CONSTRUCTOR
    //////////////////////////////////////////////////////////////////////////*/

    constructor(address _authorizedRelayer, address _wrappedNative, address _owner) Ownable(_owner) {
        authorizedRelayers[_authorizedRelayer] = true;
        emit AddAuthorizedRelayer(_authorizedRelayer);
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
            address _token = newConfigs[i].sourceTokenAddress;
            address _vault = newConfigs[i].vaultAddress;
            uint256 _chainId = newConfigs[i].sourceChainId;

            uint256 configHashChainId = uint256(keccak256(abi.encodePacked(configHash_, _chainId)));

            if (!tokens[configHashChainId].alreadyInitialized()) {
                tokens[configHashChainId].init();
            }

            if (!tokens[configHashChainId].contains(_token)) {
                (, address next) = tokens[configHashChainId].getEntriesPaginated(SENTINEL, MAX_TOKENS);
                if (next != SENTINEL && next != ZERO_ADDRESS) revert TooManyTokens();
                tokens[configHashChainId].push(_token);
            }

            config[configHash_][_chainId][_token] = _vault;
            emit ConfigSet(configHash_, _chainId, _token);
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
        return 'tuple[](uint256 sourceChainId,address sourceTokenAddress,address vaultAddress)';
    }

    function getTokens(uint256 configHash_, uint256 chainId_) external view returns (address[] memory tokensArray) {
        uint256 configHashChainId = uint256(keccak256(abi.encodePacked(configHash_, chainId_)));
        (tokensArray, ) = tokens[configHashChainId].getEntriesPaginated(SENTINEL, MAX_TOKENS);
    }

    function getAllConfigs(address account) external view returns (ConfigWithToken[] memory) {
        uint256 configHash_ = accountConfig[account];
        if (configHash_ == 0) {
            return new ConfigWithToken[](0);
        }

        uint256 chainId_ = block.chainid;
        uint256 configHashChainId = uint256(keccak256(abi.encodePacked(configHash_, chainId_)));

        (address[] memory tokensArray, ) = tokens[configHashChainId].getEntriesPaginated(SENTINEL, MAX_TOKENS);
        ConfigWithToken[] memory configsArray = new ConfigWithToken[](tokensArray.length);

        for (uint256 i; i < tokensArray.length; i++) {
            address _token = tokensArray[i];
            address _vault = config[configHash_][chainId_][_token];
            configsArray[i] = ConfigWithToken({ token: _token, vault: _vault });
        }

        return configsArray;
    }

    /*//////////////////////////////////////////////////////////////////////////
                                     MODULE LOGIC
    //////////////////////////////////////////////////////////////////////////*/

    function autoEarn(address token, uint256 amountToSave, address nexusAccount, uint256 nonce, bytes memory signature) external {
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, token, amountToSave, nexusAccount, nonce));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(hash);

        if (executedHashes[ethSignedHash]) revert SignatureAlreadyUsed();

        address relayer = ECDSA.recover(ethSignedHash, signature);
        if (!authorizedRelayers[relayer]) revert NotAuthorized(relayer);

        executedHashes[ethSignedHash] = true;
        _autoEarn(token, amountToSave, nexusAccount);
    }

    function _autoEarn(address token, uint256 amountToSave, address nexusAccount) private {
        if (!isInitialized(nexusAccount)) revert ModuleNotInitialized(nexusAccount);

        uint256 configHash_ = accountConfig[nexusAccount];
        address vaultAddress = config[configHash_][block.chainid][token];
        if (vaultAddress == address(0)) {
            revert ConfigNotFound(token);
        }

        IERC7579Account account = IERC7579Account(nexusAccount);
        IERC4626 vault = IERC4626(vaultAddress);

        IERC20 tokenToSave;

        // Handle native token wrapping
        if (token == NATIVE_TOKEN) {
            bytes memory wrapCallData = abi.encodeWithSelector(IWrappedNative.deposit.selector);
            bytes memory wrappedExecution = ExecLib.encodeSingle(wrappedNative, amountToSave, wrapCallData);

            ExecutionMode mode = _encodeExecutionMode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT);
            bytes[] memory result = account.executeFromExecutor{ value: amountToSave }(mode, wrappedExecution);

            if (result.length == 0) revert ExecutionFailed();
            tokenToSave = IERC20(wrappedNative);
        } else {
            tokenToSave = IERC20(token);
        }

        // Approve vault to spend tokens
        bytes memory approveCallData = abi.encodeWithSelector(IERC20.approve.selector, address(vault), amountToSave);
        bytes memory approveExecution = ExecLib.encodeSingle(address(tokenToSave), 0, approveCallData);

        ExecutionMode approveMode = _encodeExecutionMode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT);
        bytes[] memory approveResult = account.executeFromExecutor(approveMode, approveExecution);
        if (approveResult.length == 0) revert ExecutionFailed();

        // Deposit to vault (ERC-4626) or fallback to Aave Pool supply
        bytes memory depositExecution;
        
        // NOTE: ERC-4626 totalAssets() check is commented out because Aave pools don't support this function
        // This causes the staticcall to fail and prevents proper vault detection
        // For now, we'll always use Aave Pool supply method for Aave integrations
        /*
        (bool erc4626Supported, ) = address(vault).staticcall(abi.encodeWithSelector(IERC4626.totalAssets.selector));
        if (erc4626Supported) {
            bytes memory depositCallData = abi.encodeWithSelector(IERC4626.deposit.selector, amountToSave, nexusAccount);
            depositExecution = ExecLib.encodeSingle(address(vault), 0, depositCallData);
        } else {
        */
            bytes memory supplyCallData = abi.encodeWithSelector(
                IAavePool.supply.selector,
                address(tokenToSave),
                amountToSave,
                nexusAccount,
                uint16(0)
            );
            depositExecution = ExecLib.encodeSingle(address(vault), 0, supplyCallData);
        // }

        ExecutionMode depositMode = _encodeExecutionMode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT);
        bytes[] memory depositResult = account.executeFromExecutor(depositMode, depositExecution);
        if (depositResult.length == 0) revert ExecutionFailed();

        emit AutoEarnExecuted(nexusAccount, token, amountToSave);
    }

    /**
     * @notice Withdraw tokens from vault and transfer to specified address
     * @dev This function allows withdrawing tokens from the configured vault
     * @param token The token to withdraw
     * @param amount The amount to withdraw
     * @param to The address to transfer the withdrawn tokens to
     */
    function withdrawFromVault(address token, uint256 amount, address to) external {
        if (!isInitialized(msg.sender)) revert ModuleNotInitialized(msg.sender);

        uint256 configHash_ = accountConfig[msg.sender];
        address vaultAddress = config[configHash_][block.chainid][token];
        if (vaultAddress == address(0)) {
            revert ConfigNotFound(token);
        }

        IERC7579Account account = IERC7579Account(msg.sender);
        IERC4626 vault = IERC4626(vaultAddress);

        // For Aave pools, we need to use the withdraw function
        // Note: Aave pools use withdraw(address asset, uint256 amount, address to) 
        bytes memory withdrawCallData = abi.encodeWithSelector(
            IAavePool.withdraw.selector,
            token,
            amount,
            to
        );
        bytes memory withdrawExecution = ExecLib.encodeSingle(address(vault), 0, withdrawCallData);

        ExecutionMode withdrawMode = _encodeExecutionMode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT);
        bytes[] memory withdrawResult = account.executeFromExecutor(withdrawMode, withdrawExecution);
        if (withdrawResult.length == 0) revert ExecutionFailed();

        emit AutoEarnExecuted(msg.sender, token, amount);
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
