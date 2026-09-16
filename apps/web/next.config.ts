import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@designweave/schema",
    "@molan/protocol",
    "@molan/host",
  ],
};

export default nextConfig;
