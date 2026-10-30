import { PartOfSpeechSchema } from '@englishlearn/db/schemas';
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

describe('vocabulary (student.words)', () => {
  it.each(
    Object.keys(MESSAGES) as (keyof typeof MESSAGES)[],
  )('%s: ICU messages format', (locale) => {
    const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'student.words' });
    for (const count of [0, 1, 2, 5, 11, 21, 22]) {
      expect(t('today.due', { count })).not.toMatch(/[{}]/);
      expect(t('today.remaining', { count })).not.toMatch(/[{}]/);
    }
    for (const count of [1, 2, 5, 21]) {
      expect(t('today.due', { count })).toContain(String(count));
      expect(t('topics.progress', { started: 3, total: count })).toContain(String(count));
    }
    expect(t('today.newWords', { done: 2, limit: 10 })).toMatch(/2\D+10/);
    expect(t('limit.invalid', { min: 1, max: 50 })).toMatch(/1\D+50/);
    expect(t('topics.practiceLevel', { topic: 'Travel', level: 'A2' })).toMatch(/Travel.*A2/);
  });

  it('uses the right Slavic plural forms', () => {
    const ru = createTranslator({
      locale: 'ru',
      messages: MESSAGES.ru,
      namespace: 'student.words',
    });
    expect(ru('today.due', { count: 1 })).toBe('1 слово пора повторить');
    expect(ru('today.due', { count: 3 })).toBe('3 слова пора повторить');
    expect(ru('today.due', { count: 5 })).toBe('5 слов пора повторить');
    expect(ru('today.remaining', { count: 21 })).toBe('На сегодня осталось 21 новое слово');
    expect(ru('topics.progress', { started: 2, total: 21 })).toBe('Начато 2 из 21 слова');
    const uk = createTranslator({
      locale: 'uk',
      messages: MESSAGES.uk,
      namespace: 'student.words',
    });
    expect(uk('today.due', { count: 2 })).toBe('2 слова час повторити');
    expect(uk('today.remaining', { count: 11 })).toBe('На сьогодні залишилося 11 нових слів');
  });

  // The product addresses learners formally in ru and uk ("вы" / "ви").
  it.each([
    ['ru', /(^|[^\p{L}])(ты|тебя|тебе|тобой|твой|твоя|твоё|твое|твои|твоих|твоего)(?![\p{L}])/iu],
    ['uk', /(^|[^\p{L}])(ти|тебе|тобі|тобою|твій|твоя|твоє|твої|твоїх|твого)(?![\p{L}])/iu],
  ] as const)('%s: student.words never says "ты"', (locale, informal) => {
    const words = (MESSAGES[locale] as { student: { words: Record<string, unknown> } }).student
      .words;
    for (const key of keys(words)) {
      expect(String(lookup(words, key)), key).not.toMatch(informal);
    }
  });
});

describe('vocabulary player (student.words.player)', () => {
  const MODES = ['en_to_l1', 'l1_to_en', 'cloze', 'cued_recall', 'full_recall'] as const;

  it.each(
    Object.keys(MESSAGES) as (keyof typeof MESSAGES)[],
  )('%s: ICU messages format, every part of speech named', (locale) => {
    const t = createTranslator({
      locale,
      messages: MESSAGES[locale],
      namespace: 'student.words.player',
    });
    for (const count of [1, 2, 5, 11, 21]) {
      expect(t('done.answered', { count })).toContain(String(count));
      expect(t('done.answered', { count })).not.toMatch(/[{}]/);
    }
    const names = PartOfSpeechSchema.options.map((pos) => t('pos', { pos }));
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).not.toMatch(/[{}_]|^[A-Z_]+$/);
  });

  it('uses the right Slavic plural forms', () => {
    const ru = createTranslator({
      locale: 'ru',
      messages: MESSAGES.ru,
      namespace: 'student.words.player',
    });
    expect(ru('done.answered', { count: 1 })).toBe('Вы ответили на 1 слово.');
    expect(ru('done.answered', { count: 3 })).toBe('Вы ответили на 3 слова.');
    expect(ru('done.answered', { count: 15 })).toBe('Вы ответили на 15 слов.');
    const uk = createTranslator({
      locale: 'uk',
      messages: MESSAGES.uk,
      namespace: 'student.words.player',
    });
    expect(uk('done.answered', { count: 21 })).toBe('Ви відповіли на 21 слово.');
    expect(uk('done.answered', { count: 12 })).toBe('Ви відповіли на 12 слів.');
  });

  // Instructions are imperatives: formal plural in ru/uk ("Выберите" /
  // "Виберіть", not "Выбери" / "Вибери"), "du" in de ("Wähle", not "Wählen Sie").
  it.each([
    ['ru', /те$/],
    ['uk', /(іть|те)$/],
  ] as const)('%s: instructions use the formal imperative', (locale, formal) => {
    const player = MESSAGES[locale].student.words.player;
    for (const text of [...MODES.map((m) => player.instruction[m]), player.proofInstruction]) {
      expect(text.split(/[\s:,.]/)[0], text).toMatch(formal);
    }
  });

  it('de: addresses the learner with "du"', () => {
    const player = MESSAGES.de.student.words.player;
    for (const key of keys(player)) {
      expect(String(lookup(player, key)), key).not.toMatch(/\b(Sie|Ihre?n?)\b/);
    }
  });
});

describe('landing copy (marketing)', () => {
  // Same in every locale: English grammar terms and the product name.
  const SAME_AS_EN = new Set([
    'map.rows.pastSimple',
    'map.rows.presentPerfect',
    'problem.ours.label',
  ]);
  const marketing = (locale: keyof typeof MESSAGES) =>
    (MESSAGES[locale] as { marketing: Record<string, unknown> }).marketing;
  const entries = (locale: keyof typeof MESSAGES) =>
    keys(marketing(locale)).map((key) => [key, String(lookup(marketing(locale), key))] as const);

  it.each(
    Object.keys(MESSAGES) as (keyof typeof MESSAGES)[],
  )('%s: never promises listening — the product measures grammar and vocabulary', (locale) => {
    for (const [key, text] of entries(locale)) {
      expect(text, key).not.toMatch(/listen|аудир|аудіюв|слуха|слух|hörverst|zuhör/i);
    }
  });

  it.each(
    Object.keys(MESSAGES) as (keyof typeof MESSAGES)[],
  )('%s: tutoring is never offered, and no straight double quotes', (locale) => {
    for (const [key, text] of entries(locale)) {
      expect(text, key).not.toMatch(/tutor|репетитор|Lehrer|Nachhilfe/i);
      expect(text, key).not.toContain('"');
    }
  });

  it.each(['ru', 'uk', 'de'] as const)('%s: translated, not left in English', (locale) => {
    for (const [key, text] of entries(locale)) {
      if (!SAME_AS_EN.has(key)) expect(text, key).not.toBe(lookup(marketing('en'), key));
    }
  });

  it.each([
    ['ru', /(^|[^\p{L}])(ты|тебя|тебе|тобой|твой|твоя|твоё|твое|твои|твоих|твоего)(?![\p{L}])/iu],
    ['uk', /(^|[^\p{L}])(ти|тебе|тобі|тобою|твій|твоя|твоє|твої|твоїх|твого)(?![\p{L}])/iu],
  ] as const)('%s: formal address, «…» quotes only', (locale, informal) => {
    for (const [key, text] of entries(locale)) {
      expect(text, key).not.toMatch(informal);
      expect(text, key).not.toMatch(/[„“]/);
    }
  });

  it('uk: the apostrophe inside words is U+2019', () => {
    for (const [key, text] of entries('uk')) expect(text, key).not.toMatch(/\p{L}'\p{L}/u);
  });

  it('de: "du", „…“ quotes only', () => {
    for (const [key, text] of entries('de')) {
      expect(text, key).not.toMatch(/\b(Sie|Ihre?[mnrs]?|Ihnen)\b/);
      expect(text, key).not.toMatch(/[«»]/);
    }
  });
});
