import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { cookieStorage, createStorage } from "wagmi";
import { defineChain } from "viem";
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  seiTestnet,
  sepolia,
  unichainSepolia,
  worldchainSepolia,
} from "wagmi/chains";

// WalletConnect project id. This is a PUBLIC client identifier (it ships in the
// browser bundle), so it's safe to commit as the default; abuse is bounded by the
// allowed-domains list configured in WalletConnect Cloud. Override per-env with
// NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID if needed.
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
  "8ad4a8c682ffb4d49ff4dda0dc14bb1c";

// Arc Testnet isn't in wagmi/chains — define it so "connect wallet & pay" can
// switch a wallet to it. USDC is the native gas token there.
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  testnet: true,
});

// Test mode adds the Sepolia/CCTP testnets used by the private-route test hub, so a
// connected wallet can be switched to whichever chain the user is sending FROM.
const testMode = process.env.NEXT_PUBLIC_TEST_MODE === "true";

export const wagmiConfig = getDefaultConfig({
  appName: "wall8",
  projectId,
  chains: testMode
    ? [
        baseSepolia,
        sepolia,
        arbitrumSepolia,
        optimismSepolia,
        polygonAmoy,
        unichainSepolia,
        worldchainSepolia,
        seiTestnet,
        arcTestnet,
        mainnet,
        base,
        arbitrum,
        optimism,
        polygon,
      ]
    : [mainnet, base, arbitrum, optimism, polygon],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});
