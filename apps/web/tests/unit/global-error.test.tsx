import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uk from '../../messages/uk.json';

const { captureException, path } = vi.hoisted(() => ({
  captureException: vi.fn(),
  path: { current: '/' as string | null },
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));
vi.mock('next/navigation', () => ({ usePathname: () => path.current }));
vi.mock('@/app/fonts', () => ({ fontVariables: 'fonts' }));

const { default: GlobalError } = await import('@/app/global-error');

const SECRET = 'connect ECONNREFUSED 10.0.0.5:5432 at PrismaClient.query';

beforeEach(() => {
  vi.clearAllMocks();
  // <html> inside the test container: React reports the nesting, which is expected here.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function renderAt(pathname: string | null, reset = vi.fn()) {
  path.current = pathname;
  const error = Object.assign(new Error(SECRET), { digest: 'digest-123' });
  const view = render(<GlobalError error={error} reset={reset} />);
  return { ...view, error, reset };
}

describe('global-error (the root layout itself failed)', () => {
  it.each([
    ['/ru/dashboard', 'ru', ru],
    ['/uk', 'uk', uk],
    ['/de/words/practice', 'de', de],
    ['/dashboard', 'en', en],
    ['/', 'en', en],
    ['/xx/page', 'en', en],
    [null, 'en', en],
  ] as const)('%s → copy in %s, from the URL alone', async (pathname, locale, messages) => {
    renderAt(pathname);
    expect(await screen.findByRole('heading', { name: messages.errors.title })).toBeVisible();
    expect(screen.getByText(messages.errors.description)).toBeInTheDocument();
    // React 19 renders <html> as a singleton: its attributes land on the document's own.
    expect(document.documentElement).toHaveAttribute('lang', locale);
  });

  it('reports the error to Sentry once, and never shows it or its digest', async () => {
    const { error } = renderAt('/ru');
    const container = document.body;
    await screen.findByRole('heading', { name: ru.errors.title });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error);
    expect(container.textContent).not.toContain('ECONNREFUSED');
    expect(container.textContent).not.toContain('digest-123');
  });

  it('is busy until the copy has loaded, then retry calls reset', async () => {
    const { container, reset } = renderAt('/de');
    const main = container.querySelector('main');
    expect(main).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(await screen.findByRole('button', { name: de.errors.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(main).toHaveAttribute('aria-busy', 'false'));
  });

  it('loads the catalogues lazily: no static import of a messages file', () => {
    const source = readFileSync(join(process.cwd(), 'app/global-error.tsx'), 'utf8');
    // `import type` is erased; a value import would ship all four catalogues on every page.
    expect(source).not.toMatch(/^import (?!type\b)[^;]*messages\/\w+\.json/m);
    expect(source.match(/import\('\.\.\/messages\/(en|ru|uk|de)\.json'\)/g)).toHaveLength(4);
  });
});
