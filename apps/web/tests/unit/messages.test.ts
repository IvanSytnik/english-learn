import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uk from '../../messages/uk.json';

const MESSAGES = { en, ru, uk, de } as const;

function keys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object'
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

function lookup(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}

describe('message catalogues', () => {
  it('every locale has exactly the English key set', () => {
    const reference = keys(en).sort();
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      expect(keys(messages).sort(), locale).toEqual(reference);
    }
  });

  it.each(
    Object.keys(MESSAGES) as (keyof typeof MESSAGES)[],
  )('%s: password reset copy is complete and translated', (locale) => {
    const messages = MESSAGES[locale] as Record<string, unknown>;
    for (const ns of ['auth.forgot', 'auth.reset', 'email.passwordReset']) {
      const own = keys(messages).filter((k) => k.startsWith(`${ns}.`));
      expect(own.length, ns).toBeGreaterThan(0);
      for (const key of own) {
        const value = lookup(messages, key);
        expect(typeof value === 'string' && value.trim() !== '', key).toBe(true);
        // Not left in English ("Email" is the same word in most of them).
        if (locale !== 'en' && !key.endsWith('.email')) {
          expect(value, key).not.toBe(lookup(en, key));
        }
      }
    }
  });

  it.each(
    Object.keys(MESSAGES) as (keyof typeof MESSAGES)[],
  )('%s: learning ICU messages format with every plural category', (locale) => {
    const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'learning' });
    for (const days of [0, 1, 2, 3, 5, 11, 21, 22, 25]) {
      expect(t('reason.lastPractised', { days })).not.toMatch(/[{}]/);
    }
    for (const days of [1, 2, 5, 21, 22]) {
      expect(t('feedback.backInDays', { days })).toContain(String(days));
    }
    expect(t('reason.unlockedBy', { concept: 'Past Simple' })).toContain('Past Simple');
    expect(t('session.progressValue', { done: 3, total: 12 })).toMatch(/3.*12/);
    for (const count of [1, 2, 6, 12, 21, 24]) {
      expect(t('sessionLength.items', { count })).toContain(String(count));
    }
    expect(t('sessionLength.option', { minutes: 20 })).toContain('20');
    for (const done of [0, 1, 3, 4]) {
      expect(t('week.progress', { done, goal: 3 })).toMatch(new RegExp(`${done}\\D+3`));
    }
  });

  it('uses the right Slavic plural forms', () => {
    const ru = createTranslator({ locale: 'ru', messages: MESSAGES.ru, namespace: 'learning' });
    expect(ru('feedback.backInDays', { days: 1 })).toBe('Вернёмся через 1 день');
    expect(ru('feedback.backInDays', { days: 3 })).toBe('Вернёмся через 3 дня');
    expect(ru('feedback.backInDays', { days: 5 })).toBe('Вернёмся через 5 дней');
    const uk = createTranslator({ locale: 'uk', messages: MESSAGES.uk, namespace: 'learning' });
    expect(uk('reason.lastPractised', { days: 2 })).toBe('Остання практика 2 дні тому');
    expect(uk('reason.lastPractised', { days: 21 })).toBe('Остання практика 21 день тому');
    expect(ru('sessionLength.items', { count: 6 })).toBe('6 вопросов');
    expect(ru('sessionLength.items', { count: 24 })).toBe('24 вопроса');
    expect(uk('sessionLength.items', { count: 12 })).toBe('12 запитань');
    expect(ru('week.progress', { done: 2, goal: 3 })).toBe('2 из 3 сессий');
    expect(uk('week.progress', { done: 1, goal: 3 })).toBe('1 з 3 сесій');
  });

  it.each(
    Object.keys(MESSAGES) as (keyof typeof MESSAGES)[],
  )('%s: dashboard ICU messages format', (locale) => {
    const t = createTranslator({
      locale,
      messages: MESSAGES[locale],
      namespace: 'student.dashboard',
    });
    for (const count of [1, 2, 5, 21]) {
      expect(t('review', { count })).toContain(String(count));
      expect(t('lockedBy', { count, topics: 'X' })).toContain('X');
    }
    for (const category of [
      'GRAMMAR',
      'VOCAB',
      'LISTENING',
      'PHONETICS',
      'DISCOURSE',
      'PRAGMATICS',
    ]) {
      const label = t('category', { category });
      expect(label).not.toMatch(/[{}]/);
      expect(label).not.toBe(t('category', { category: 'unknown' }));
    }
    expect(t('quoted', { title: 'Past Simple' })).toMatch(/^\W+Past Simple\W+$/);
  });

  it('dashboard: Slavic plural forms of the review CTA', () => {
    const ru = createTranslator({
      locale: 'ru',
      messages: MESSAGES.ru,
      namespace: 'student.dashboard',
    });
    expect(ru('review', { count: 1 })).toBe('Повторить (1 тему)');
    expect(ru('review', { count: 3 })).toBe('Повторить (3 темы)');
    expect(ru('review', { count: 5 })).toBe('Повторить (5 тем)');
    const uk = createTranslator({
      locale: 'uk',
      messages: MESSAGES.uk,
      namespace: 'student.dashboard',
    });
    expect(uk('review', { count: 2 })).toBe('Повторити (2 теми)');
    expect(uk('review', { count: 11 })).toBe('Повторити (11 тем)');
  });
});
