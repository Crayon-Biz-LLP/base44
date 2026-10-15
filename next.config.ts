import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow requests from staff links served over the dev host/IP during demos.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
