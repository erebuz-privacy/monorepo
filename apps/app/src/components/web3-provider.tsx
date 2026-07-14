"use client";

import "@rainbow-me/rainbowkit/styles.css";

import {
  darkTheme,
  lightTheme,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/lib/wagmi";

const rkDark = darkTheme({
  accentColor: "#f5f5f5",
  accentColorForeground: "#0a0a0a",
  borderRadius: "medium",
});
const rkLight = lightTheme({
  accentColor: "#171717",
  accentColorForeground: "#ffffff",
  borderRadius: "medium",
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const { resolvedTheme } = useTheme();

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={resolvedTheme === "light" ? rkLight : rkDark}
          modalSize="compact"
          appInfo={{ appName: "wall8" }}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
