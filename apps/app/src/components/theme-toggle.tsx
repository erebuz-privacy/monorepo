"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { cn } from "@erebuz/ui/lib/utils";

type Theme = "dark" | "light";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Reflect the persisted theme after mount (client only) — hydration-safe.
    /* eslint-disable react-hooks/set-state-in-effect */
    const saved = (localStorage.getItem("wall8:theme") as Theme) || "dark";
    setMounted(true);
    setTheme(saved);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("wall8:theme", next);
    } catch {
      // ignore
    }
    const d = document.documentElement;
    d.classList.toggle("dark", next === "dark");
    d.style.colorScheme = next;
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className={cn(
        "text-muted-foreground hover:text-foreground hover:bg-accent flex size-9 items-center justify-center rounded-full transition-colors",
        className
      )}
    >
      {mounted ? (
        theme === "dark" ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )
      ) : (
        <span className="size-4" />
      )}
    </button>
  );
}
