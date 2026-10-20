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

describe('message catalogues', () => {
  it('every locale has exactly the English key set', () => {
    const reference = keys(en).sort();
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      expect(keys(messages).sort(), locale).toEqual(reference);
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
  });

  it('uses the right Slavic plural forms', () => {
    const ru = createTranslator({ locale: 'ru', messages: MESSAGES.ru, namespace: 'learning' });
    expect(ru('feedback.backInDays', { days: 1 })).toBe('Вернёмся через 1 день');
    expect(ru('feedback.backInDays', { days: 3 })).toBe('Вернёмся через 3 дня');
    expect(ru('feedback.backInDays', { days: 5 })).toBe('Вернёмся через 5 дней');
    const uk = createTranslator({ locale: 'uk', messages: MESSAGES.uk, namespace: 'learning' });
    expect(uk('reason.lastPractised', { days: 2 })).toBe('Остання практика 2 дні тому');
    expect(uk('reason.lastPractised', { days: 21 })).toBe('Остання практика 21 день тому');
  });
});
