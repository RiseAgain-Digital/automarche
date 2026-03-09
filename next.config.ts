import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow serving uploaded images from /public/uploads
  images: {
    remotePatterns: [],
    unoptimized: process.env.NODE_ENV === "development",
  },
  // Increase body parser limit for image uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
