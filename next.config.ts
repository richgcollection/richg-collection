import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  experimental: {
    serverActions: {
      // Vercel's own request-body limit for server uploads is a hard 4.5MB
      // regardless of this setting — kept just under it for a clean error
      // from our own validation instead of an opaque platform-level one.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
