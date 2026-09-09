/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Type checking via tsc covers correctness; skip the broken root eslint-config-next
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
