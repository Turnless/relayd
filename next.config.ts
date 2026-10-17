import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The FalkorDB client opens a TCP socket; keep it out of the bundler.
  serverExternalPackages: ["falkordb"],
  // Logs and cached extractions are read from disk at runtime.
  outputFileTracingIncludes: { "/api/**": ["./data/**/*"] },
};

export default nextConfig;
