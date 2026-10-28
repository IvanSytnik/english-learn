import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs/config';
import createNextIntlPlugin from 'next-intl/plugin';
// Fail the build early on missing/invalid env vars.
import './lib/env';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ['@englishlearn/ai', '@englishlearn/learner-model', '@englishlearn/ui'],
  // Monorepo root, so file tracing doesn't stop at apps/web
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // No outputFileTracingIncludes for Prisma: the prisma-client generator imports
  // the query compiler as a JS module, so normal tracing picks it up.
  // Tracing @prisma/client/runtime pulls every provider's wasm (~57 MiB); we
  // only need the Postgres query compiler (engineType "client" never loads
  // query_engine_bg.*).
  outputFileTracingExcludes: {
    '/**/*': [
      '../../node_modules/.pnpm/**/@prisma/client/runtime/query_engine_bg.*',
      '../../node_modules/.pnpm/**/@prisma/client/runtime/query_compiler_bg.{cockroachdb,mysql,sqlite,sqlserver}.*',
    ],
  },
  // @prisma/client and pg are already in Next's default server externals.
  serverExternalPackages: ['bcryptjs'],
};

// No authToken: source maps are not uploaded, so the build needs no Sentry secrets.
// The tunnel proxies browser events through our origin (ad blockers drop sentry.io);
// proxy.ts's matcher skips it.
export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  telemetry: false,
  tunnelRoute: '/monitoring',
});
