import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the desktop build (Electron runs .next/standalone/server.js).
  output: "standalone",
  // clasp is spawned as a separate Node process from node_modules — never bundle it.
  serverExternalPackages: ["@google/clasp"],
  // `next build` otherwise runs `next lint`, which with no ESLint config stops to ASK how to set it up — and a
  // build started without a terminal (desktop:build, CI) then waits forever. Lint is its own step (npm run lint).
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Allow large Server Action / route payloads (full GAS file sets).
    serverActions: { bodySizeLimit: "4mb" },
  },
  // Local http server: no HSTS / upgrade-insecure-requests (they would break http://127.0.0.1).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};

export default nextConfig;
