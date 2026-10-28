import * as Sentry from '@sentry/nextjs';

// Edge runtime (proxy.ts), loaded by instrumentation.ts. Without a DSN the SDK stays disabled.
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0.1,
});
