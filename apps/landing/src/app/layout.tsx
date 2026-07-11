import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

import { SmoothScroll } from "@/components/motion/SmoothScroll";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.erebuz.com"),
  title: "Erebuz | The Privacy Router For Every Payment",
  description:
    "Erebuz is the privacy middleware between any app and the blockchain. One call handles routing, privacy, compliance and gas. No custom crypto.",
  openGraph: {
    title: "Erebuz | The Privacy Router For Every Payment",
    description:
      "Private, compliant transactions on every chain. One SDK call, no custom crypto.",
    type: "website",
    url: "/",
    siteName: "Erebuz",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Erebuz, the privacy router for every payment",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Erebuz | The Privacy Router For Every Payment",
    description:
      "Private, compliant transactions on every chain. One SDK call, no custom crypto.",
    site: "@0xerebuz",
    creator: "@0xerebuz",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} antialiased`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
