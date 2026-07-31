import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No native build steps, no image optimization dependency on native binaries.
  images: { unoptimized: true },
};

export default nextConfig;
