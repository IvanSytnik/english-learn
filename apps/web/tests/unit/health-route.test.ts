import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above plain declarations — hoist the mock fn with it.
const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('@englishlearn/db', () => ({ prisma: { $queryRaw: queryRaw } }));

const { GET } = await import('@/app/api/health/route');

describe('GET /api/health', () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('returns 200 when the database answers', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('returns 503 without leaking the error when the database is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED secret-host:5432'));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: 'error', db: 'down' });
    expect(JSON.stringify(body)).not.toContain('secret-host');
  });
});
