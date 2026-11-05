import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';

const { captureException, hardReload } = vi.hoisted(() => ({
  captureException: vi.fn(),
  hardReload: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));
vi.mock('@/lib/hard-reload', () => ({ hardReload }));

const { default: LocaleError } = await import('@/app/[locale]/error');

const SECRET = 'connect ECONNREFUSED 10.0.0.5:5432 at PrismaClient.query';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

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

  // V2-15: an action passed straight to a form (the login form) rejects into
  // this boundary when the server no longer knows its id.
  it('an unknown server action reloads once instead; again after the reload → the normal error', () => {
    const unknown = () =>
      new UnrecognizedActionError('Server Action "60cba21f" was not found on the server.');
    renderError('en', vi.fn(), unknown());
    expect(hardReload).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    cleanup();
    renderError('en', vi.fn(), unknown());
    expect(hardReload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: en.errors.title })).toBeInTheDocument();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('any other error never reloads', () => {
    renderError('en');
    expect(hardReload).not.toHaveBeenCalled();
  });
});
