import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException }));

const { default: LocaleError } = await import('@/app/[locale]/error');

const SECRET = 'connect ECONNREFUSED 10.0.0.5:5432 at PrismaClient.query';

beforeEach(() => vi.clearAllMocks());

function renderError(locale: 'en' | 'ru', reset = vi.fn(), error = new Error(SECRET)) {
  const messages = locale === 'en' ? en : ru;
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleError error={Object.assign(error, { digest: 'abc123' })} reset={reset} />
    </NextIntlClientProvider>,
  );
  return reset;
}

describe('[locale]/error.tsx', () => {
  it.each([
    ['en', en.errors],
    ['ru', ru.errors],
  ] as const)('renders the %s copy', (locale, copy) => {
    renderError(locale);
    expect(screen.getByRole('heading', { name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.description)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.retry })).toBeInTheDocument();
  });

  it('calls reset() when "Try again" is clicked', () => {
    const reset = renderError('en');
    fireEvent.click(screen.getByRole('button', { name: en.errors.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('reports the error to Sentry once', () => {
    const error = new Error(SECRET);
    renderError('en', vi.fn(), error);
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('never shows the raw error message', () => {
    renderError('en');
    expect(document.body.textContent).not.toContain(SECRET);
    expect(document.body.textContent).not.toContain('abc123');
  });
});
