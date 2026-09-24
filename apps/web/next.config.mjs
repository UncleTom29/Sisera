import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  env: {
    SISERA_API_URL: process.env.SISERA_API_URL ?? "http://localhost:8000",
  },
  async rewrites() {
    const target = process.env.SISERA_API_URL ?? "http://127.0.0.1:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${target}/api/v1/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `${target}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
