import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above plain declarations — hoist the mocks with it.
const { queryRaw, env } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  env: { HEALTH_TOKEN: undefined as string | undefined },
}));
vi.mock('@englishlearn/db', () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock('@/lib/env', () => ({ env }));

const { GET } = await import('@/app/api/health/route');

const get = (query = '', headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/health${query}`, { headers }));

beforeEach(() => {
  queryRaw.mockReset();
  env.HEALTH_TOKEN = undefined;
});

describe('GET /api/health (liveness)', () => {
  it('returns 200 with uptime and never touches the database', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({
      status: 'ok',
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });
    expect(Number.isInteger(body.uptime)).toBe(true);
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('stays DB-free for ready values other than 1 and when the database is down', async () => {
    queryRaw.mockRejectedValue(new Error('down'));
    for (const q of ['?ready=0', '?ready=true', '?token=x']) {
      expect((await get(q)).status).toBe(200);
    }
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('does not require HEALTH_TOKEN', async () => {
    env.HEALTH_TOKEN = 'secret-token';
    expect((await get()).status).toBe(200);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('GET /api/health?ready=1 (readiness)', () => {
  it('queries the database and returns latency', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const res = await get('?ready=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      status: 'ok',
      db: 'connected',
      latencyMs: expect.any(Number),
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns 503 without leaking the error when the database is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED secret-host:5432'));
    const res = await get('?ready=1');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: 'error', db: 'down' });
    expect(JSON.stringify(body)).not.toContain('secret-host');
  });

  describe('with HEALTH_TOKEN set', () => {
    beforeEach(() => {
      env.HEALTH_TOKEN = 'secret-token';
      queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    });

    it.each([
      ['no token', '?ready=1', {}],
      ['a wrong header', '?ready=1', { 'x-health-token': 'nope' }],
      ['a wrong query token', '?ready=1&token=nope', {}],
      ['a token prefix', '?ready=1&token=secret', {}],
    ])('rejects %s with 401 and no DB query', async (_, query, headers) => {
      const res = await get(query, headers);
      expect(res.status).toBe(401);
      expect(JSON.stringify(await res.json())).not.toContain('secret-token');
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it.each([
      ['the header', '?ready=1', { 'x-health-token': 'secret-token' }],
      ['the query param', '?ready=1&token=secret-token', {}],
    ])('accepts the token via %s', async (_, query, headers) => {
      const res = await get(query, headers);
      expect(res.status).toBe(200);
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
