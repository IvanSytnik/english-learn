import { existsSync } from 'node:fs';
import { lexemeIdentity, loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import {
  LOCALIZATION_SNAPSHOT_URL,
  loadLocalizationSnapshot,
} from '@englishlearn/db/vocab/localization-snapshot';
import { describe, expect, it } from 'vitest';
import type { PendingLexeme } from '../types';
import { validateLocalizedBatch } from '../validator';

/**
 * The committed snapshot is applied without a model call, so it must pass the
 * same gate a live answer does: every entry, back in the wire shape, accepted
 * by validateLocalizedBatch (gloss length, scripts, DE articles, cloze).
 */
describe.skipIf(!existsSync(LOCALIZATION_SNAPSHOT_URL))('the committed snapshot', () => {
  // 4944 entries through the full gate: 0.15 s alone, but 7.4 s once in a
  // parallel turbo run — past the 5 s default. Same budget as the card snapshot.
  it('passes the localization gate, entry by entry', { timeout: 60_000 }, () => {
    const lemmas = new Map(loadCefrJDataset().lexemes.map((l) => [lexemeIdentity(l), l]));
    const { entries } = loadLocalizationSnapshot();
    const requested: PendingLexeme[] = entries.map((e, i) => {
      const lexeme = lemmas.get(lexemeIdentity(e));
      return {
        id: lexemeIdentity(e),
        key: String(i + 1),
        lemma: lexeme?.lemma ?? e.lemmaKey,
        pos: e.pos as PendingLexeme['pos'],
        sense: e.sense,
        cefrLevel: e.cefrLevel,
        topic: lexeme?.topic ?? 'general',
      };
    });
    const { rejected } = validateLocalizedBatch(requested, {
      items: entries.map((e, i) => ({
        key: String(i + 1),
        lemma: requested[i]?.lemma,
        definitionEn: e.definitions.en,
        translations: e.translations,
        examples: e.examples,
        collocations: e.collocations,
      })),
    });
    expect(rejected).toEqual([]);
  });
});
