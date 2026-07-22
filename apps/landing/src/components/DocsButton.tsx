import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const DOCS_URL = "https://docs.erebuz.com/";

export function DocsButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={DOCS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center justify-center rounded-none border border-white/15 text-[15px] font-semibold text-neutral-300 transition-colors hover:border-white/40 hover:text-white",
        className,
      )}
    >
      {children}
    </a>
  );
}
