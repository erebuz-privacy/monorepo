export const nexusFactoryAbi = [
  {
    type: "function",
    name: "createAccount",
    stateMutability: "payable",
    inputs: [
      { name: "initData", type: "bytes" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "account", type: "address" }],
  },
  {
    type: "function",
    name: "computeAccountAddress",
    stateMutability: "view",
    inputs: [
      { name: "initData", type: "bytes" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "account", type: "address" }],
  },
] as const;

export const bootstrapInitNexusAbi = [
  {
    type: "function",
    name: "initNexusWithDefaultValidatorAndOtherModulesNoRegistry",
    stateMutability: "payable",
    inputs: [
      { name: "defaultValidatorInitData", type: "bytes" },
      {
        name: "validators",
        type: "tuple[]",
        components: [
          { name: "module", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "executors",
        type: "tuple[]",
        components: [
          { name: "module", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "hook",
        type: "tuple",
        components: [
          { name: "module", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "fallbacks",
        type: "tuple[]",
        components: [
          { name: "module", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "preValidationHooks",
        type: "tuple[]",
        components: [
          { name: "hookType", type: "uint256" },
          { name: "module", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export const autoShieldConfigAbi = [
  {
    type: "function",
    name: "getAccountConfig",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "operator", type: "address" },
      { name: "initialized", type: "bool" },
    ],
  },
] as const;

export const autoShieldNonceAbi = [
  {
    type: "function",
    name: "getAccountNonce",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
] as const;

export const autoShieldExecuteAbi = [
  {
    type: "function",
    name: "executeShieldedTransferViaAccount",
    stateMutability: "payable",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "returnData", type: "bytes[]" }],
  },
] as const;

