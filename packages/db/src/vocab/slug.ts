import { z } from 'zod';
import type { PartOfSpeechValue } from '../schemas/lexeme';

/**
 * The public address of a word (B6-SPEC §1, B6.6): its natural key
 * `lemmaKey + pos + sense` as a URL slug — `look-up-phrasal-verb`,
 * `march-noun-month`. Browsing pages and their actions name words only by
 * this slug; Item and Lexeme ids never reach the client (Axiom 3).
 *
 * Lower-case ASCII letters and digits joined by single hyphens: accents are
 * folded (`café` → `cafe`), apostrophes dropped (`o'clock` → `oclock`),
 * every other run of non-alphanumerics is one hyphen (`a.m.` → `a-m`). The
 * POS is its enum name in lower case with `_` → `-`; an empty sense adds
 * nothing. Unique over the catalogue (checked by test on the committed
 * dataset); `slugIndex` refuses an ambiguous slug instead of guessing.
 */

const fold = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’ʼ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function lexemeSlug(key: {
  lemmaKey: string;
  pos: PartOfSpeechValue;
  sense?: string | null;
}): string {
  return [fold(key.lemmaKey), fold(key.pos), fold(key.sense ?? '')]
    .filter((part) => part.length > 0)
    .join('-');
}

/** What a client may send as a word address (validated before any lookup). */
export const LexemeSlugSchema = z
  .string()
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * Slug → entry over `entries` (e.g. the published pool). A slug that two
 * entries share maps to neither: an ambiguous address is NOT_FOUND, never the
 * wrong word. `ambiguous` lists them (a data bug to fix, logged by callers).
 */
export function slugIndex<
  T extends { lemmaKey: string; pos: PartOfSpeechValue; sense?: string | null },
>(entries: readonly T[]): { bySlug: ReadonlyMap<string, T>; ambiguous: string[] } {
  const bySlug = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const entry of entries) {
    const slug = lexemeSlug(entry);
    if (bySlug.has(slug)) ambiguous.add(slug);
    else bySlug.set(slug, entry);
  }
  for (const slug of ambiguous) bySlug.delete(slug);
  return { bySlug, ambiguous: [...ambiguous].sort() };
}
