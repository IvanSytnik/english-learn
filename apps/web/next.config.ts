import path from 'node:path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ['@englishlearn/ai', '@englishlearn/ui'],
  // Monorepo root, so file tracing doesn't stop at apps/web
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  outputFileTracingIncludes: {
    '/**/*': ['../../packages/db/src/generated/client/**/*'],
  },
  // Prisma compatibility on serverless
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default withNextIntl(nextConfig);
