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

// Runs before paint — applies the saved theme (default dark) so there's no flash.
const themeScript = `try{var t=localStorage.getItem('wall8:theme')||'dark';var d=document.documentElement;d.classList.toggle('dark',t==='dark');d.style.colorScheme=t;}catch(e){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}`;

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background text-foreground min-h-dvh font-sans">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
