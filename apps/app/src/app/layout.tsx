import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "@erebuz/ui/globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { Web3Provider } from "@/components/web3-provider";
import { AppProvider } from "@/lib/store";
import { RouteDraftProvider } from "@/lib/route-draft";

const geistSans = Hanken_Grotesk({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "wall8 | Private Transfers",
  description: "Send money privately, across any chain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="bg-background text-foreground min-h-dvh font-sans"
        suppressHydrationWarning
      >
        {/* next-themes handles no-flash, persistence and the .dark class */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          storageKey="wall8:theme"
          disableTransitionOnChange
        >
          <Web3Provider>
            <AppProvider>
              <RouteDraftProvider>{children}</RouteDraftProvider>
            </AppProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
