"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Clock, Send, Settings } from "lucide-react";

import { cn } from "@erebuz/ui/lib/utils";

// import { ConnectWallet } from "@/components/connect-wallet"; // not needed for now
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Send", icon: Send },
  { href: "/activity", label: "Activity", icon: Clock },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      {/* translucent sticky top nav — 3-column grid keeps the nav dead-centre
          regardless of how wide the logo / actions on either side are. */}
      <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6">
        <Link href="/" className="press flex w-fit items-center gap-2 justify-self-start">
          <span className="flex size-8 items-center justify-center rounded-xl bg-neutral-950 ring-1 ring-black/10 dark:ring-white/10">
            <Image src="/wall8-logo.svg" alt="wall8" width={18} height={18} priority unoptimized />
          </span>
          <span className="tracking-apple hidden text-lg font-semibold sm:inline">wall8</span>
        </Link>

        <nav className="bg-muted/60 flex items-center gap-1 justify-self-center rounded-full p-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 justify-self-end">
          {/* <ConnectWallet /> — not needed for now */}
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
