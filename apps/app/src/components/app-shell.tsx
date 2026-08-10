"use client";

import Link from "next/link";
import Image from "next/image";

// import { ConnectWallet } from "@/components/connect-wallet"; // not needed for now
import { ThemeToggle } from "@/components/theme-toggle";
import { DitheringSimplexBackdrop } from "@/components/dithering-simplex-backdrop";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DitheringSimplexBackdrop>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center px-4 sm:px-6">
        <Link href="/" className="press text-foreground flex w-fit items-center gap-2.5">
          <span className="border-border flex size-8 items-center justify-center rounded-xl border bg-white shadow-sm dark:bg-neutral-950">
            <Image src="/wall8-logo.svg" alt="wall8" width={18} height={18} priority unoptimized className="invert dark:invert-0" />
          </span>
          <span className="tracking-apple hidden text-lg font-semibold sm:inline">wall8</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="border-border bg-background rounded-full border shadow-sm [&_button]:text-foreground/65 [&_button:hover]:bg-foreground/10 [&_button:hover]:text-foreground">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </DitheringSimplexBackdrop>
  );
}
