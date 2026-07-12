import Image from "next/image";

import { cn } from "@erebuz/ui/lib/utils";

import { ThemeToggle } from "@/components/theme-toggle";

/** wall8 wordmark, with an optional theme toggle on the right. */
export function BrandHeader({
  themeToggle = true,
  className,
}: {
  themeToggle?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-center justify-between", className)}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-950">
          <Image src="/wall8-logo.svg" alt="wall8" width={18} height={18} priority unoptimized />
        </span>
        <span className="text-lg font-semibold tracking-tight">wall8</span>
      </div>
      {themeToggle ? <ThemeToggle /> : null}
    </div>
  );
}
