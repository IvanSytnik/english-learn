import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import LocaleError from '@/app/[locale]/error';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';

const SECRET = 'connect ECONNREFUSED 10.0.0.5:5432 at PrismaClient.query';

function renderError(locale: 'en' | 'ru', reset = vi.fn()) {
  const messages = locale === 'en' ? en : ru;
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleError error={Object.assign(new Error(SECRET), { digest: 'abc123' })} reset={reset} />
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

  it('never shows the raw error message', () => {
    renderError('en');
    expect(document.body.textContent).not.toContain(SECRET);
    expect(document.body.textContent).not.toContain('abc123');
  });
});
