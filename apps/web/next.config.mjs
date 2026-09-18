/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow document rendering and OCR to finish beyond the default 30 seconds.
  experimental: { proxyTimeout: 300000 },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000"}/:path*` }];
  },
  eslint: {
    // Type checking via tsc covers correctness; skip the broken root eslint-config-next
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
