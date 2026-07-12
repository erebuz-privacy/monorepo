"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Clock, Send, Settings } from "lucide-react";

import { cn } from "@erebuz/ui/lib/utils";

import { GradientAvatar } from "@/components/crypto-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { useApp } from "@/lib/store";

const NAV = [
  // Home is temporarily disabled - the quote screen ("/") is the landing screen.
  // { href: "/home", label: "Home", icon: Home },
  { href: "/", label: "Send", icon: Send },
  { href: "/activity", label: "Activity", icon: Clock },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useApp();
  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="bg-background stage-grid flex min-h-dvh flex-col">
      {/* top nav */}
      <header className="border-border/60 flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-950">
            <Image
              src="/wall8-logo.svg"
              alt="wall8"
              width={18}
              height={18}
              priority
              unoptimized
            />
          </span>
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">
            wall8
          </span>
        </Link>

        <nav className="bg-muted/60 flex items-center gap-1 rounded-full p-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
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

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link href="/settings" className="flex items-center gap-2 pl-1">
            {firstName ? (
              <span className="text-muted-foreground hidden text-sm font-medium sm:inline">
                {firstName}
              </span>
            ) : null}
            <GradientAvatar
              seed={user?.email ?? "wall8"}
              label={user?.name}
              size={32}
            />
          </Link>
        </div>
      </header>

      {/* pages own their own width + framing */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
