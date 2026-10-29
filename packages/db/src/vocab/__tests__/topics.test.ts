import { describe, expect, it } from 'vitest';
import { ConceptTitleSchema } from '../../schemas/concept';
import { SUPPORTED_LOCALES } from '../../schemas/locale';
import {
  FALLBACK_TOPIC,
  getVocabTopic,
  parseVocabConceptId,
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

describe('parseVocabConceptId', () => {
  it('reads back every topic × level id vocabConceptId builds', () => {
    for (const topic of VOCAB_TOPIC_IDS) {
      for (const level of ['A1', 'A2', 'B1'] as const) {
        expect(parseVocabConceptId(vocabConceptId(topic, level))).toEqual({ topic, level });
      }
    }
    expect(parseVocabConceptId('t-run.food_drink.b2', 't-run')).toEqual({
      topic: 'food_drink',
      level: 'B2',
    });
  });

  it.each([
    'grammar.past_simple',
    'vocab.food_drink',
    'vocab.food_drink.a1.x',
    'vocab.cooking.a1',
    'vocab.food_drink.d1',
    'vocab.food_drink.A1',
    'other.food_drink.a1',
    'test-vsession-x.vocab',
  ])('is null for %s', (id) => {
    expect(parseVocabConceptId(id)).toBeNull();
  });
});
