import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { source } from "@/lib/source";

const LOGO_MASK = {
  maskImage: "url(/images/erebuz-logo.svg)",
  WebkitMaskImage: "url(/images/erebuz-logo.svg)",
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
} as const;

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      githubUrl="https://github.com/erebuz-privacy"
      nav={{
        title: (
          <span className="flex items-center gap-2">
            <span
              className="block size-5 bg-fd-foreground"
              style={LOGO_MASK}
            />
            <span className="text-[15px] font-bold tracking-tight">
              Erebuz
            </span>
          </span>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
