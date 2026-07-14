import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { cookieStorage, createStorage } from "wagmi";
import { arbitrum, base, mainnet, optimism, polygon } from "wagmi/chains";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "wall8-dev-placeholder";

export const wagmiConfig = getDefaultConfig({
  appName: "wall8",
  projectId,
  chains: [mainnet, base, arbitrum, optimism, polygon],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});
