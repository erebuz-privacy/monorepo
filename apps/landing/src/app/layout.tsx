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
  metadataBase: new URL("https://erebuz.dev"),
  title: "Erebuz | The Privacy Router For Every Payment",
  description:
    "Erebuz is the privacy middleware between any app and the blockchain. One call handles routing, privacy, compliance and gas. No custom crypto.",
  openGraph: {
    title: "Erebuz | The Privacy Router For Every Payment",
    description:
      "Private, compliant transactions on every chain. One SDK call, no custom crypto.",
    type: "website",
    url: "https://erebuz.dev/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} antialiased`}>
      <body>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
