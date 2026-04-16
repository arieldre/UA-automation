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

  // Proxy /api/* to working backend (ua-automation-lac in prod, local Express in dev)
  async rewrites() {
    const apiBase = process.env.NODE_ENV === 'production'
      ? 'https://ua-automation-lac.vercel.app'
      : 'http://localhost:3000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
