import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { cookieStorage, createStorage } from "wagmi";
import {
  arbitrum,
  base,
  baseSepolia,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from "wagmi/chains";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "wall8-dev-placeholder";

// Test mode adds the Sepolia testnets used by the private-route test hub.
const testMode = process.env.NEXT_PUBLIC_TEST_MODE === "true";

export const wagmiConfig = getDefaultConfig({
  appName: "wall8",
  projectId,
  chains: testMode
    ? [baseSepolia, sepolia, mainnet, base, arbitrum, optimism, polygon]
    : [mainnet, base, arbitrum, optimism, polygon],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});
