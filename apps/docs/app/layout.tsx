import "./globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { Topbar } from "@/components/topbar";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.erebuz.com"),
  title: {
    template: "%s | Erebuz Docs",
    default: "Erebuz Docs",
  },
  description:
    "The privacy router for every payment. Private, compliant transfers on every chain from one SDK call.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans">
        <RootProvider theme={{ defaultTheme: "dark" }}>
          <Topbar />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
