/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    SISERA_API_URL: process.env.SISERA_API_URL ?? "http://localhost:8000",
  },
};

export default nextConfig;
