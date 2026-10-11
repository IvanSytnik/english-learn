import { prisma } from '@englishlearn/db';

// Always hit the DB — never serve a cached health result.
export const dynamic = 'force-dynamic';

/**
 * Liveness + DB connectivity probe. Public (the proxy matcher skips /api) and
 * deliberately exposes no config or error details — only up/down and latency.
 */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: 'ok', db: 'up', latencyMs: Date.now() - started },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[health] database check failed', error);
    return Response.json(
      { status: 'error', db: 'down' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
