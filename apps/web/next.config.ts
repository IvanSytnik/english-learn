import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: ['@englishlearn/db', '@englishlearn/ai', '@englishlearn/ui'],
  // Prisma compatibility on serverless
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default withNextIntl(nextConfig);
