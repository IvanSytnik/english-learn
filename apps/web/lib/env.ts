import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/**
 * Validated at build time via the import in next.config.ts, so a Vercel deploy
 * with missing secrets fails the build instead of the first request.
 * Set SKIP_ENV_VALIDATION=1 to bypass (CI, Docker image builds).
 */
export const env = createEnv({
  server: {
    // Pooled URL (Neon `-pooler` host) — used by the runtime Prisma client.
    DATABASE_URL: z.string().url(),
    // Direct (non-pooler) URL — used only by the Prisma CLI for migrations.
    DIRECT_URL: z.string().url().optional(),
    AUTH_SECRET: z.string().min(16),
    AUTH_URL: z.string().url().optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    // Optional: without a DSN Sentry stays disabled (sentry.*.config.ts).
    SENTRY_DSN: z.string().url().optional(),
    // Optional: without a key the mailer logs the reset link instead (dev, tests).
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('EnglishLearn <noreply@sytnik-studio.com>'),
    // Origin for links in emails. Never taken from the request Host (reset-link poisoning).
    APP_URL: z.string().url().default('http://localhost:3000'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  },
  client: {
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
