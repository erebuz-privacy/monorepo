import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Section on the page grid: a top rule, a label/index meta row, then centered
 * content. Vertical structure comes only from the outer page frame.
 */
export function Section({
  id,
  label,
  index,
  heading,
  intro,
  children,
  className,
}: {
  id?: string;
  label: string;
  index: string;
  heading: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("border-t border-white/10", className)}>
      <div className="px-6 py-24 md:py-32 lg:px-12">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">{label}</span>
          <span className="tabular-nums text-neutral-600">{index}</span>
        </div>

        <div className="mx-auto mt-12 max-w-3xl text-center">
          <h2 className="text-[clamp(2rem,4.2vw,3.25rem)] font-bold leading-[1.05] tracking-[-0.03em]">
            {heading}
          </h2>
          {intro ? (
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-400">
              {intro}
            </p>
          ) : null}
        </div>

        {children ? (
          <div className="mx-auto mt-14 max-w-4xl">{children}</div>
        ) : null}
      </div>
    </section>
  );
}
