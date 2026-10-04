import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // The repo root holds both frontend/ and backend/, so Next cannot infer which
  // directory is the workspace root. Pin it to this app.
  turbopack: { root: path.join(__dirname) },
  devIndicators: false,
};

export default nextConfig;
