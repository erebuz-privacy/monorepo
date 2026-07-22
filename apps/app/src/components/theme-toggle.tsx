"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@erebuz/ui/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid a hydration mismatch - the resolved theme is only known on the client.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      className={cn(
        "press text-muted-foreground hover:text-foreground hover:bg-accent flex size-9 cursor-pointer items-center justify-center rounded-full",
        className
      )}
    >
      {mounted ? (
        // Re-key by theme so the icon fades/rotates in on every toggle.
        <span key={isDark ? "dark" : "light"} className="value-swap flex">
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </span>
      ) : (
        <span className="size-4" />
      )}
    </button>
  );
}
