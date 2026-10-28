import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
