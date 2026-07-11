import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A CTA that isn't live yet; reveals "Coming soon" on hover / tap. */
export function SoonButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      title="Coming soon"
      className={cn(
        "group relative inline-flex cursor-default items-center justify-center rounded-none border border-white/15 text-[15px] font-semibold text-neutral-400 transition-colors hover:border-white/30",
        className,
      )}
    >
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap border border-white/10 bg-[#141311] px-2 py-1 text-[11px] font-normal text-neutral-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        Coming soon
      </span>
    </span>
  );
}
