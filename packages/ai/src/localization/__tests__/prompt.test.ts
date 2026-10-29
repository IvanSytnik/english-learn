import { describe, expect, it } from 'vitest';
import { buildLocalizationRequest, buildUserPrompt, LOCALIZATION_SYSTEM_PROMPT } from '../prompt';
import type { LocalizationRequestItem } from '../types';

const items: LocalizationRequestItem[] = [
  { key: '1', lemma: 'bank', pos: 'NOUN', sense: '', cefrLevel: 'A2', topic: 'services' },
  { key: '2', lemma: 'March', pos: 'NOUN', sense: 'month', cefrLevel: 'A1', topic: 'daily_life' },
];

describe('buildLocalizationRequest', () => {
  const request = buildLocalizationRequest(items, { model: 'claude-haiku-5-5' });

  it('puts the frozen system prompt behind a cache breakpoint', () => {
    expect(request.system).toEqual([
      { type: 'text', text: LOCALIZATION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ]);
    expect(LOCALIZATION_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('asks for structured output with an object root', () => {
    const format = request.output_config?.format as { type: string; schema: { type: string } };
    expect(format.type).toBe('json_schema');
    expect(format.schema.type).toBe('object');
    expect(request.output_config).not.toHaveProperty('effort');
    expect(request.model).toBe('claude-haiku-5-5');
  });

  it('passes effort through when given', () => {
    const withEffort = buildLocalizationRequest(items, { model: 'm', effort: 'low' });
    expect(withEffort.output_config?.effort).toBe('low');
  });
});

describe('buildUserPrompt', () => {
  it('lists one JSON line per word with short keys, sense only when set', () => {
    expect(buildUserPrompt(items).split('\n')).toEqual([
      'Words:',
      '{"key":"1","lemma":"bank","pos":"NOUN","level":"A2","topic":"services"}',
      '{"key":"2","lemma":"March","pos":"NOUN","sense":"month","level":"A1","topic":"daily_life"}',
    ]);
  });
});
