/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from bundling server-side Node.js packages used by API route wrappers.
  // These are resolved at runtime from node_modules, not bundled into the Next.js output.
  serverExternalPackages: ['mongodb', '@vercel/functions'],
};

module.exports = nextConfig;
