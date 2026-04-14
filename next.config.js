/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exclude webapp/ from Next.js compilation
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/webapp/**', '**/node_modules/**'],
    };
    return config;
  },
};

module.exports = nextConfig;
