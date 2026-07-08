import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@erebuz/ui/globals.css";

import { AppProvider } from "@/lib/store";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-dvh font-sans">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
