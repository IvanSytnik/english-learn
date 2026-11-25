import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireRole, loadWordPage, notFound } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  loadWordPage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'uk' }));
vi.mock('@/lib/authz', () => ({ requireRole }));
vi.mock('@/lib/vocab-word', () => ({ loadWordPage }));
vi.mock('@/app/_components/footer', () => ({ Footer: () => null }));
vi.mock('@/app/[locale]/(student)/words/w/[slug]/word-view', () => ({ WordView: () => null }));

const { default: WordPage, metadata } = await import(
  '@/app/[locale]/(student)/words/w/[slug]/page'
);
const { WordView } = await import('@/app/[locale]/(student)/words/w/[slug]/word-view');

const VIEW = { slug: 'luggage-noun', headword: 'luggage' };
const open = (slug: string) => WordPage({ params: Promise.resolve({ slug }) });

async function viewProps(page: Promise<React.ReactElement>) {
  const outer = await page;
  const children = (outer.props as { children: React.ReactElement[] }).children;
  const view = children.find((c) => c.type === WordView) as React.ReactElement;
  return { props: view.props, key: view.key };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ id: 'user-1', role: 'STUDENT' });
  loadWordPage.mockResolvedValue(VIEW);
});

describe('/words/w/[slug] (B6.8)', () => {
  it('learners only; the word loaded for the learner in the UI locale', async () => {
    const { props, key } = await viewProps(open('luggage-noun'));
    expect(requireRole).toHaveBeenCalledWith('STUDENT');
    expect(loadWordPage).toHaveBeenCalledWith({
      userId: 'user-1',
      uiLocale: 'uk',
      slug: 'luggage-noun',
    });
    expect(props).toEqual({ view: VIEW });
    expect(key).toBe('luggage-noun');
  });

  it('not a learner: requireRole answers 404 before anything is read', async () => {
    requireRole.mockImplementation(() => notFound());
    await expect(viewProps(open('luggage-noun'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(loadWordPage).not.toHaveBeenCalled();
  });

  it('an unknown, malformed or ambiguous slug is a 404', async () => {
    loadWordPage.mockResolvedValue(null);
    await expect(viewProps(open('bank-noun'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('is not indexed', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
