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

  // Proxy /api/* to local Express server in dev only (vercel.json handles production routing)
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
