import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "@erebuz/ui/globals.css";
import "./theme.css";

import { ThemeProvider } from "@/components/theme-provider";
import { TxTracker } from "@/components/tx-tracker";
import { Web3Provider } from "@/components/web3-provider";
import { AppProvider } from "@/lib/store";

const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat",
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
      className={`${montserrat.variable} h-full antialiased`}
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
              {/* Polls any locally-recorded pending transfer, app-wide. */}
              <TxTracker />
              {children}
            </AppProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
