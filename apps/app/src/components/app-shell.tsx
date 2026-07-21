"use client";

import Link from "next/link";
import Image from "next/image";
// import { usePathname } from "next/navigation";
// import { cn } from "@erebuz/ui/lib/utils";

// import { ConnectWallet } from "@/components/connect-wallet"; // not needed for now
import { ThemeToggle } from "@/components/theme-toggle";

// const NAV = [
//   { href: "/", label: "Send" },
//   // { href: "/activity", label: "Activity" },
//   // { href: "/settings", label: "Settings" },
// ];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex h-16 shrink-0 items-center border-b px-4 backdrop-blur-xl sm:px-6">
        <Link href="/" className="press flex w-fit items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-neutral-950 ring-1 ring-black/10 dark:ring-white/10">
            <Image src="/wall8-logo.svg" alt="wall8" width={18} height={18} priority unoptimized />
          </span>
          <span className="tracking-apple hidden text-lg font-semibold sm:inline">wall8</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
