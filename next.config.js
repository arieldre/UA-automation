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

  // Proxy /api/* to Express server in development
  // In production (Vercel), vercel.json rewrites handle this
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
