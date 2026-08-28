// Public request/response types for the /private-route feature.

export interface CreatePrivateRouteInput {
  sourceChainId: number;
  destChainId: number;
  /** Human-readable amount, e.g. "5". */
  amount: string;
  /** Where the user ultimately receives funds on the destination chain. */
  userDestinationAddress: string;
  /** Source token symbol; defaults to USDC. */
  tokenSymbol?: string;
  /** Destination token symbol; defaults to the source symbol (same-asset route). */
  destTokenSymbol?: string;
  /** Privacy pool used for this route. Defaults to Railgun. */
  privacyProvider?: 'railgun' | 'arc' | 'strk20';
}

export interface CreatePrivateRouteResult {
  routeId: string;
  status: string;
  /** Address the user sends `amount` of the source token to (Relay leg-1). */
  depositAddress: string;
  /** The TEE-owned Nexus hub account that receives the leg-1 funds on the hub chain. */
  hubAccount: string;
  /** Whether AA execution is available on the hub chain (required to operate the hub account). */
  hubIsSmartAccount: boolean;
  requestId: string;
  sourceChainId: number;
  destChainId: number;
  hubChainId: number;
  /** Source token symbol (sent) and destination token symbol (received). */
  tokenSymbol: string;
  destTokenSymbol: string;
  /** Amount the user sends, in the source token's smallest unit. */
  amount: string;
  /** Route fee, in the DESTINATION token's smallest unit (charged on the output). */
  feeAmount: string;
  /** Output delivered to the user, in the DESTINATION token's smallest unit (gross - fee). */
  quotedOutputAmount: string;
  privacyProvider: 'railgun' | 'arc' | 'strk20';
}
