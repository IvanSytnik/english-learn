import { describe, expect, it } from 'vitest';
import { ConceptTitleSchema } from '../../schemas/concept';
import { SUPPORTED_LOCALES } from '../../schemas/locale';
import {
  FALLBACK_TOPIC,
  getVocabTopic,
  resolveVocabTopic,
  VOCAB_TOPIC_IDS,
  VOCAB_TOPICS,
  vocabConceptId,
} from '../topics';

describe('VOCAB_TOPICS', () => {
  it('is the 14 Threshold topics plus the fallback, each id once', () => {
    expect(VOCAB_TOPICS.filter((t) => t.threshold !== null)).toHaveLength(14);
    expect(new Set(VOCAB_TOPIC_IDS).size).toBe(VOCAB_TOPICS.length);
    expect(getVocabTopic(FALLBACK_TOPIC).threshold).toBeNull();
  });

  it.each(
    VOCAB_TOPICS.map((t) => [t.id, t] as const),
  )('%s has a valid concept title in every locale', (_, topic) => {
    expect(ConceptTitleSchema.parse(topic.title)).toEqual(topic.title);
    expect(Object.keys(topic.title).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it('uses ids that make lowercase snake_case concept ids', () => {
    for (const id of VOCAB_TOPIC_IDS) expect(id).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});

describe('resolveVocabTopic', () => {
  it('returns a known topic and falls back when there is none', () => {
    expect(resolveVocabTopic('food_drink')).toBe('food_drink');
    expect(resolveVocabTopic(undefined)).toBe('general');
  });

  it('throws on an unknown topic', () => {
    expect(() => resolveVocabTopic('Food and drink')).toThrow(/Unknown vocabulary topic/);
  });
});

describe('vocabConceptId', () => {
  it('is vocab.<topic>.<level>', () => {
    expect(vocabConceptId('food_drink', 'A1')).toBe('vocab.food_drink.a1');
    expect(vocabConceptId('general', 'B1', 'test-run')).toBe('test-run.general.b1');
  });
});
