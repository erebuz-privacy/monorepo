import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @erebuz/ui is an internal source-only workspace package; let Next transpile it.
  transpilePackages: ["@erebuz/ui"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
