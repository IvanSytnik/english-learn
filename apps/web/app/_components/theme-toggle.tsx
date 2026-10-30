'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from '@/lib/theme/init-script';

type Theme = 'light' | 'dark';

/** The theme in effect: an explicit `data-theme`, else the OS preference. */
function effectiveTheme(): Theme {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Light/dark switch for the top bar. A toggle button ("Dark theme", pressed in
 * dark mode); the choice goes to `data-theme` and localStorage, which the head
 * script (lib/theme/init-script.ts) reapplies before the next first paint.
 */
export function ThemeToggle() {
  const t = useTranslations('common.theme');
  // Unknown on the server: the state appears after mount, the button does not move.
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(effectiveTheme()), []);

  function toggle() {
    const next: Theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice still holds for this page.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('dark')}
      aria-pressed={theme === null ? undefined : theme === 'dark'}
      className="inline-flex size-9 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      data-theme-toggle=""
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5">
        {theme === 'dark' ? (
          // Sun: pressing returns to light.
          <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
          </g>
        ) : (
          <path
            d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}
