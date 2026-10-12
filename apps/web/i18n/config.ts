// Plain locale constants, free of next-intl imports so pure modules (lib/access.ts) can use them.
export const locales = ['en', 'ru', 'uk', 'de'] as const;
export const defaultLocale = 'en';
// next-intl's default locale cookie (routing.ts keeps the default `localeCookie` config).
export const localeCookieName = 'NEXT_LOCALE';
