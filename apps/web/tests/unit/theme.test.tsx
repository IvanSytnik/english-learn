import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '@/app/_components/theme-toggle';
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '@/lib/theme/init-script';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uk from '../../messages/uk.json';

const MESSAGES = { en, ru, uk, de } as const;
const html = document.documentElement;

function osPrefers(scheme: 'light' | 'dark') {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' && scheme === 'dark',
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  delete html.dataset.theme;
  osPrefers('light');
});
afterEach(() => vi.restoreAllMocks());

describe('theme init script (runs in <head> before first paint)', () => {
  const run = () => new Function(THEME_INIT_SCRIPT)();

  it.each(['light', 'dark'])('applies a stored "%s"', (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    run();
    expect(html.dataset.theme).toBe(theme);
  });

  it.each([null, 'system', 'DARK', ''])('leaves the OS in charge for %j', (value) => {
    if (value !== null) localStorage.setItem(THEME_STORAGE_KEY, value);
    run();
    expect(html.dataset.theme).toBeUndefined();
  });

  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(run).not.toThrow();
    expect(html.dataset.theme).toBeUndefined();
  });

  it('is inlined in the root layout, with the hydration warning suppressed on <html>', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    expect(layout).toMatch(
      /<head>\s*<script dangerouslySetInnerHTML=\{\{ __html: THEME_INIT_SCRIPT \}\} \/>/,
    );
    expect(layout).toMatch(/<html[^>]*suppressHydrationWarning/);
  });
});

describe.each(Object.keys(MESSAGES) as (keyof typeof MESSAGES)[])('ThemeToggle (%s)', (locale) => {
  const renderToggle = () =>
    render(
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        <ThemeToggle />
      </NextIntlClientProvider>,
    );
  const label = MESSAGES[locale].common.theme.dark;

  it('starts from the OS preference, switches to dark and stores it', async () => {
    renderToggle();
    const button = screen.getByRole('button', { name: label });
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
    fireEvent.click(button);
    expect(html.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(html.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('reads a dark OS as pressed, and the first click goes light', async () => {
    osPrefers('dark');
    renderToggle();
    const button = screen.getByRole('button', { name: label });
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.click(button);
    expect(html.dataset.theme).toBe('light');
  });

  it('an explicit data-theme wins over the OS', async () => {
    osPrefers('dark');
    html.dataset.theme = 'light';
    renderToggle();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false'),
    );
  });
});
