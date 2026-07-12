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
    function withdraw(uint256) external;
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IQuoterV2 {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

/**
 * @title AutoSwapModule
 * @notice ERC-7579 compliant Executor module for Nexus Smart Accounts
 * @dev This module allows automatic token swaps using Uniswap V3
 * ANY token in the smart account can be swapped to a single default output token
 */
contract AutoSwapModule is IExecutor, Ownable {
    
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
    error InsufficientBalance();
    error SlippageExceeded();
    error InvalidRouter();
    error InvalidQuoter();
    error InvalidSwap();

    uint256 public constant MODULE_TYPE_EXECUTOR = 2;
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice Address of the Uniswap V3 SwapRouter
    address public immutable swapRouter;

    /// @notice Address of the Uniswap V3 Quoter V2
    address public immutable quoter;

    /// @notice Address of the wrapped native token (like WETH)
    address public immutable wrappedNative;

    /// @dev authorizedRelayers -> bool
    mapping(address => bool) public authorizedRelayers;

    /// @dev config[configHash][chainId] = SwapConfig (single default output token per chain)
    mapping(uint256 => mapping(uint256 => SwapConfig)) public config;

    /// @dev accountConfig[smartAccount] = the configHash being used by that account
    mapping(address => uint256) public accountConfig;

    /// @dev executedHashes helps avoid replay attacks
    mapping(bytes32 => bool) public executedHashes;

    event AddAuthorizedRelayer(address indexed relayer);
    event RemoveAuthorizedRelayer(address indexed relayer);
    event ModuleInitialized(address indexed account);
    event ModuleUninitialized(address indexed account);
    event ConfigSet(uint256 indexed configHash, uint256 indexed chainId, address defaultOutputToken);
    event SwapExecuted(address indexed smartAccount, address indexed inputToken, address indexed outputToken, uint256 amountIn, uint256 amountOut);
    event ConfigHashChanged(address indexed account, uint256 oldConfigHash, uint256 newConfigHash);

    /*//////////////////////////////////////////////////////////////////////////
                                     STRUCTS
    //////////////////////////////////////////////////////////////////////////*/

    struct SwapConfig {
        address defaultOutputToken;  // The single output token for all swaps
        uint24 defaultPoolFee;       // Default Uniswap V3 pool fee (e.g., 3000 = 0.3%)
        uint256 slippageBps;         // Slippage tolerance in basis points (e.g., 50 = 0.5%)
    }

    struct ConfigInput {
        uint256 sourceChainId;
        address destinationTokenAddress;
        uint24 defaultPoolFee;
        uint256 slippageBps;
    }

    /*//////////////////////////////////////////////////////////////////////////
                                 CONSTRUCTOR
    //////////////////////////////////////////////////////////////////////////*/

    constructor(
        address _authorizedRelayer,
        address _swapRouter,
        address _quoter,
        address _wrappedNative,
        address _owner
    ) Ownable(_owner) {
        if (_swapRouter == address(0)) revert InvalidRouter();
        if (_quoter == address(0)) revert InvalidQuoter();
        
        authorizedRelayers[_authorizedRelayer] = true;
        emit AddAuthorizedRelayer(_authorizedRelayer);
        
        swapRouter = _swapRouter;
        quoter = _quoter;
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
            uint256 _chainId = newConfigs[i].sourceChainId;
            address _defaultOutputToken = newConfigs[i].destinationTokenAddress;
            uint24 _defaultPoolFee = newConfigs[i].defaultPoolFee;
            uint256 _slippageBps = newConfigs[i].slippageBps;

            config[configHash_][_chainId] = SwapConfig({
                defaultOutputToken: _defaultOutputToken,
                defaultPoolFee: _defaultPoolFee,
                slippageBps: _slippageBps
            });

            emit ConfigSet(configHash_, _chainId, _defaultOutputToken);
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
        return 'tuple[](uint256 sourceChainId,address destinationTokenAddress,uint24 defaultPoolFee,uint256 slippageBps)';
    }

    function getConfig(address account) 
        external 
        view 
        returns (address defaultOutputToken, uint24 defaultPoolFee, uint256 slippageBps) 
    {
        uint256 configHash_ = accountConfig[account];
        if (configHash_ == 0) {
            return (address(0), 0, 0);
        }

        SwapConfig memory swapConfig = config[configHash_][block.chainid];
        return (swapConfig.defaultOutputToken, swapConfig.defaultPoolFee, swapConfig.slippageBps);
    }

    function getConfigForChain(uint256 configHash_, uint256 chainId_) 
        external 
        view 
        returns (address defaultOutputToken, uint24 defaultPoolFee, uint256 slippageBps) 
    {
        SwapConfig memory swapConfig = config[configHash_][chainId_];
        return (swapConfig.defaultOutputToken, swapConfig.defaultPoolFee, swapConfig.slippageBps);
    }

    /*//////////////////////////////////////////////////////////////////////////
                                     MODULE LOGIC
    //////////////////////////////////////////////////////////////////////////*/

    /**
     * @notice Execute a token swap with relayer authorization
     * @dev ANY token can be swapped to the configured default output token
     * @param inputToken The token to swap from (can be any token in the smart account)
     * @param amountIn The amount of input tokens to swap
     * @param nexusAccount The Nexus account executing the swap
     * @param nonce Unique nonce to prevent replay attacks
     * @param signature Signature from authorized relayer
     */
    function swap(
        address inputToken,
        uint256 amountIn,
        address nexusAccount,
        uint256 nonce,
        bytes memory signature
    ) external payable {
        bytes32 hash = keccak256(abi.encodePacked(block.chainid, inputToken, amountIn, nexusAccount, nonce));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(hash);

        if (executedHashes[ethSignedHash]) revert SignatureAlreadyUsed();

        address relayer = ECDSA.recover(ethSignedHash, signature);
        if (!authorizedRelayers[relayer]) revert NotAuthorized(relayer);

        executedHashes[ethSignedHash] = true;
        _swap(inputToken, amountIn, nexusAccount);
    }

    function _swap(address inputToken, uint256 amountIn, address nexusAccount) private {
        if (!isInitialized(nexusAccount)) revert ModuleNotInitialized(nexusAccount);

        uint256 configHash_ = accountConfig[nexusAccount];
        SwapConfig memory swapConfig = config[configHash_][block.chainid];
        
        if (swapConfig.defaultOutputToken == address(0)) {
            revert ConfigNotFound(block.chainid);
        }

        IERC7579Account account = IERC7579Account(nexusAccount);

        address tokenIn;
        address tokenOut;
        uint256 msgValue = 0;

        // Handle native token wrapping for input
        if (inputToken == NATIVE_TOKEN) {
            // Check balance
            if (nexusAccount.balance < amountIn) revert InsufficientBalance();

            bytes memory wrapCallData = abi.encodeWithSelector(IWrappedNative.deposit.selector);
            bytes memory wrappedExecution = ExecLib.encodeSingle(wrappedNative, amountIn, wrapCallData);

            ExecutionMode mode = _encodeExecutionMode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT);
            bytes[] memory result = account.executeFromExecutor{ value: amountIn }(mode, wrappedExecution);

            if (result.length == 0) revert ExecutionFailed();
            tokenIn = wrappedNative;
        } else {
            // Check balance
            if (IERC20(inputToken).balanceOf(nexusAccount) < amountIn) revert InsufficientBalance();
            tokenIn = inputToken;
        }

        // Determine output token (handle if output is native token)
        if (swapConfig.defaultOutputToken == NATIVE_TOKEN) {
            tokenOut = wrappedNative; // Swap to WETH first, then unwrap
        } else {
            tokenOut = swapConfig.defaultOutputToken;
        }

        // Don't swap if input and output are the same
        if (tokenIn == tokenOut) revert InvalidSwap();

        // Get quote for expected output amount
        uint256 expectedAmountOut = _getQuote(tokenIn, tokenOut, amountIn, swapConfig.defaultPoolFee);
        
        // Calculate minimum amount out with slippage tolerance
        uint256 amountOutMinimum = (expectedAmountOut * (10000 - swapConfig.slippageBps)) / 10000;

        // Approve SwapRouter to spend tokens
        bytes memory approveCallData = abi.encodeWithSelector(IERC20.approve.selector, swapRouter, amountIn);
        bytes memory approveExecution = ExecLib.encodeSingle(tokenIn, 0, approveCallData);

        ExecutionMode approveMode = _encodeExecutionMode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT);
        bytes[] memory approveResult = account.executeFromExecutor(approveMode, approveExecution);
        if (approveResult.length == 0) revert ExecutionFailed();

        // Execute swap via Uniswap V3 SwapRouter
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: swapConfig.defaultPoolFee,
            recipient: nexusAccount,
            deadline: block.timestamp + 300, // 5 minutes deadline
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0 // No price limit
        });

        bytes memory swapCallData = abi.encodeWithSelector(
            ISwapRouter.exactInputSingle.selector,
            params
        );

        bytes memory swapExecution = ExecLib.encodeSingle(swapRouter, msgValue, swapCallData);

        ExecutionMode swapMode = _encodeExecutionMode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT);
        bytes[] memory swapResult = account.executeFromExecutor{ value: msgValue }(swapMode, swapExecution);
        if (swapResult.length == 0) revert ExecutionFailed();

        // Decode the amount out from the result
        uint256 amountOut = abi.decode(swapResult[0], (uint256));

        // If output should be native token, unwrap WETH
        if (swapConfig.defaultOutputToken == NATIVE_TOKEN) {
            bytes memory unwrapCallData = abi.encodeWithSelector(IWrappedNative.withdraw.selector, amountOut);
            bytes memory unwrapExecution = ExecLib.encodeSingle(wrappedNative, 0, unwrapCallData);

            ExecutionMode unwrapMode = _encodeExecutionMode(CALLTYPE_SINGLE, EXECTYPE_DEFAULT);
            bytes[] memory unwrapResult = account.executeFromExecutor(unwrapMode, unwrapExecution);
            if (unwrapResult.length == 0) revert ExecutionFailed();
        }

        emit SwapExecuted(nexusAccount, inputToken, swapConfig.defaultOutputToken, amountIn, amountOut);
    }

    /**
     * @notice Get a quote for the expected output amount from Uniswap
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input tokens
     * @param fee Pool fee tier
     * @return expectedAmountOut Expected output amount
     */
    function _getQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee
    ) private returns (uint256 expectedAmountOut) {
        // Note: quoteExactInputSingle is not a view function in QuoterV2
        // It uses staticcall internally to simulate the swap
        try IQuoterV2(quoter).quoteExactInputSingle(
            tokenIn,
            tokenOut,
            amountIn,
            fee,
            0 // sqrtPriceLimitX96 = 0 (no limit)
        ) returns (uint256 amountOut, uint160, uint32, uint256) {
            expectedAmountOut = amountOut;
        } catch {
            // If quote fails, revert to prevent potential bad swaps
            revert SlippageExceeded();
        }
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

    /**
     * @notice Allows receiving ETH
     */
    receive() external payable {}
}