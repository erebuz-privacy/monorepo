import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://erebuz.dev"),
  title: "Erebuz - Your Privacy Router for Every Chain",
  description:
    "Erebuz is the privacy middleware SDK that sits between any app and the blockchain. Private, compliant, and ready in days.",
  twitter: {
    site: "@erebuz",
    card: "summary_large_image",
    title: "Erebuz - Your Privacy Router for Every Chain",
    description:
      "Erebuz is the privacy middleware SDK that sits between any app and the blockchain. Private, compliant, and ready in days.",
    images: ["/seo/opengraph.jpg"],
  },
  openGraph: {
    title: "Erebuz - Your Privacy Router for Every Chain",
    description:
      "Erebuz is the privacy middleware SDK that sits between any app and the blockchain. Private, compliant, and ready in days.",
    images: ["/seo/opengraph.jpg"],
    type: "website",
    url: "https://erebuz.dev/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} antialiased`}
    >
      <head>
        <meta name="theme-color" content="#FFFF00" />
      </head>
      <body className="bg-background text-foreground font-sans overflow-x-hidden">{children}</body>
    </html>
  );
}
