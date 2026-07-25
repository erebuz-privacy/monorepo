"use client";

import Link from "next/link";
import Image from "next/image";

// import { ConnectWallet } from "@/components/connect-wallet"; // not needed for now
import { ThemeToggle } from "@/components/theme-toggle";
import { glassSurfaceVariants } from "@erebuz/ui/components/glass-surface";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background relative isolate flex min-h-dvh flex-col overflow-hidden">
      {/* Static brand-tinted backdrop (theme-aware, CSS only). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 36%, color-mix(in oklch, var(--brand) 16%, transparent), transparent 62%)",
        }}
      />
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center px-4 sm:px-6">
        <Link href="/" className="press text-foreground flex w-fit items-center gap-2.5">
          <span className={`${glassSurfaceVariants({ tone: "clear", depth: "raised", blur: "sm" })} flex size-8 items-center justify-center rounded-xl bg-white ring-black/20 dark:bg-neutral-950 dark:ring-white/10`}>
            <Image src="/wall8-logo.svg" alt="wall8" width={18} height={18} priority unoptimized className="invert dark:invert-0" />
          </span>
          <span className="tracking-apple hidden text-lg font-semibold sm:inline">wall8</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className={`${glassSurfaceVariants({ tone: "clear", depth: "raised", blur: "sm" })} rounded-full [&_button]:text-foreground/65 [&_button:hover]:bg-foreground/10 [&_button:hover]:text-foreground`}>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
