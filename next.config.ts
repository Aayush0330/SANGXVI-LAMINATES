import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "21mb",
    },
  },
  turbopack: {
    root: /* turbopackIgnore: true */ process.cwd(),
  },
};

export default nextConfig;
