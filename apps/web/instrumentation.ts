import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

// Server Component, route handler and server action errors; a no-op while Sentry is disabled.
export const onRequestError = Sentry.captureRequestError;
