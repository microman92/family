import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir:
    process.env.FAMILY_AUTH_E2E_BUILD === '1'
      ? '.next-e2e-auth'
      : process.env.FAMILY_E2E_BUILD === '1'
        ? '.next-e2e'
        : '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  async headers() {
    return [
      {
        source: '/invite/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      { source: '/login', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/register', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      {
        source: '/auth/callback',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/auth/telegram-bind/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
