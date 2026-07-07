import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @erebuz/sdk and @erebuz/ui are internal source-only workspace packages;
  // let Next transpile them.
  transpilePackages: ["@erebuz/sdk", "@erebuz/ui"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
