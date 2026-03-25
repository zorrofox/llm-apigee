import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone', // Cloud Run 部署使用独立输出模式
  // 安全 headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // 防止 CVE-2025-29927：拦截攻击者发来的 middleware bypass header
          { key: 'X-Middleware-Subrequest', value: '' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
