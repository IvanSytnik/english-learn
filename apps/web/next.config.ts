import path from 'node:path';
import createNextIntlPlugin from 'next-intl/plugin';
// Fail the build early on missing/invalid env vars.
import './lib/env';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ['@englishlearn/ai', '@englishlearn/ui'],
  // Monorepo root, so file tracing doesn't stop at apps/web
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // The generated client loads query_compiler_bg.wasm via fs at runtime, which
  // file tracing can't see — ship the generated directory explicitly.
  outputFileTracingIncludes: {
    '/**/*': ['../../packages/db/src/generated/client/**/*'],
  },
  // @prisma/client and pg are already in Next's default server externals.
  serverExternalPackages: ['bcryptjs'],
};

export default withNextIntl(nextConfig);
