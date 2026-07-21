import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @erebuz/sdk and @erebuz/ui are internal source-only workspace packages;
  // let Next transpile them.
  transpilePackages: ["@erebuz/sdk", "@erebuz/ui"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  // Must match turbopack.root — `vercel build` otherwise pins this to apps/app
  // and Turbopack can't resolve the workspace-hoisted next package.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Lower memory use when running the webpack dev server (`dev:light`).
  experimental: {
    webpackMemoryOptimizations: true,
  },
  // Applies only to `next dev --webpack` (the `dev:light` script). Stops the
  // watcher from scanning node_modules + sibling packages — the main source of
  // continuous CPU/lag on this monorepo.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.next/**",
          "**/.git/**",
          "**/apps/landing/**",
          "**/contracts/**",
        ],
        aggregateTimeout: 400,
        poll: false,
      };
    }
    return config;
  },
};

export default nextConfig;
