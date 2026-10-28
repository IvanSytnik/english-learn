import * as Sentry from '@sentry/nextjs';

// Browser init. Turbopack never loads sentry.client.config.ts; Next picks this file up instead.
// NEXT_PUBLIC_ vars are inlined at build time, so an unset DSN ships a disabled SDK.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
