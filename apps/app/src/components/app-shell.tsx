"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Send, Settings } from "lucide-react";

import { cn } from "@erebuz/ui/lib/utils";

const NAV = [
  // Home is temporarily disabled — send is the landing screen for now.
  // { href: "/home", label: "Home", icon: Home },
  { href: "/send", label: "Send", icon: Send },
  { href: "/activity", label: "Activity", icon: Clock },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="bg-muted/40 flex min-h-dvh justify-center">
      <div className="bg-background relative flex min-h-dvh w-full max-w-md flex-col border-border sm:border-x">
        <main className="flex-1 pb-20">{children}</main>

        <nav className="bg-background/90 border-border sticky bottom-0 z-10 border-t backdrop-blur">
          <div className="mx-auto flex max-w-md items-stretch justify-around">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("size-5", active && "text-primary")} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
