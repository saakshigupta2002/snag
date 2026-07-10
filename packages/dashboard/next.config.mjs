/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@snag/shared', '@snag/detectors'],
};

export default nextConfig;
