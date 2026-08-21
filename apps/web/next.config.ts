import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@designweave/schema",
    "@designweave/molan-protocol",
    "@designweave/molan-host",
  ],
};

export default nextConfig;
