"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Thin wrapper around next-themes — the shadcn-standard theming provider. */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
