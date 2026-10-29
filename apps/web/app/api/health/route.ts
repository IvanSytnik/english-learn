import { createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '@englishlearn/db';
import { env } from '@/lib/env';

// Never serve a cached health result.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

// Hash both sides so the comparison is constant-time regardless of length.
const digest = (s: string) => createHash('sha256').update(s).digest();
const tokenMatches = (given: string | null, expected: string) =>
  given !== null && timingSafeEqual(digest(given), digest(expected));

/**
 * Public (the proxy matcher skips /api) and deliberately exposes no config or
 * error details.
 *
 * - `GET /api/health` — liveness. Never touches the database, so an external
 *   uptime pinger cannot keep Neon awake and burn compute hours (pitfall 51).
 * - `GET /api/health?ready=1` — readiness: `SELECT 1` with latency. Opt-in; when
 *   HEALTH_TOKEN is set it must arrive as `x-health-token` or `?token=`.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get('ready') !== '1') {
    return Response.json(
      {
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      { headers: NO_STORE },
    );
  }

  const expected = env.HEALTH_TOKEN;
  if (
    expected &&
    !tokenMatches(req.headers.get('x-health-token'), expected) &&
    !tokenMatches(searchParams.get('token'), expected)
  ) {
    return Response.json({ status: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: 'ok', db: 'connected', latencyMs: Date.now() - started },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error('[health] database check failed', error);
    return Response.json({ status: 'error', db: 'down' }, { status: 503, headers: NO_STORE });
  }
}
