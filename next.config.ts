import type { NextConfig } from "next";
import { portlessOrigin } from "./src/lib/local-access";
const devOrigin = portlessOrigin();
const config: NextConfig = {
  agentRules: false,
  ...(devOrigin ? { allowedDevOrigins: [new URL(devOrigin).hostname] } : {}),
  serverExternalPackages: ["@prisma/client", "puppeteer", "bullmq"],
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};
export default config;
