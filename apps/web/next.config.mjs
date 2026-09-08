/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Konva's Node entry (lib/index-node.js) requires the optional native
    // `canvas` package. In the browser build this is not needed (the browser
    // has a native <canvas>), so alias it to false to prevent webpack from
    // trying to resolve the native package.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
