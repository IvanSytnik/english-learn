import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('../../client', () => ({ prisma: { diagnosticItem: { findFirst } } }));

import type { DiagnosticContent } from '../../schemas';
import {
  checkDiagnosticAnswer,
  getDiagnosticItemForStudent,
  gradeDiagnosticChoice,
} from '../exercises';

const content: DiagnosticContent = {
  source: {
    stem: 'If I ___ rich, I would travel the world.',
    choices: ['was', 'were', 'am', 'be'],
    correctIndex: 1,
  },
  localized: { explanation: { en: "Second conditional uses 'were' for all persons." } },
};
const row = { id: 'di1', cefrLevel: 'B1', kind: 'GRAMMAR', content };

beforeEach(() => findFirst.mockReset());

describe('getDiagnosticItemForStudent', () => {
  it('never leaks the answer key or the explanation to the client', async () => {
    findFirst.mockResolvedValue(row);
    const view = await getDiagnosticItemForStudent('di1');
    expect(view).toEqual({
      id: 'di1',
      cefrLevel: 'B1',
      kind: 'GRAMMAR',
      stem: content.source.stem,
      choices: ['was', 'were', 'am', 'be'],
    });
    const json = JSON.stringify(view);
    expect(json).not.toContain('correctIndex');
    expect(json).not.toContain('explanation');
    expect(json).not.toContain('Second conditional');
  });

  it('reads PUBLISHED items only', async () => {
    findFirst.mockResolvedValue(null);
    expect(await getDiagnosticItemForStudent('draft')).toBeNull();
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({ id: 'draft', status: 'PUBLISHED' });
  });
});

describe('gradeDiagnosticChoice', () => {
  it('accepts only the correct index', () => {
    expect(gradeDiagnosticChoice(content, 1)).toBe(true);
    expect(gradeDiagnosticChoice(content, 0)).toBe(false);
    expect(gradeDiagnosticChoice(content, 3)).toBe(false);
  });

  it('treats a malformed answer as incorrect, never correct', () => {
    for (const bad of [-1, 4, 1.5, '1', Number.NaN, null, undefined, [1], { index: 1 }, true]) {
      expect(gradeDiagnosticChoice(content, bad)).toBe(false);
    }
  });
});

describe('checkDiagnosticAnswer', () => {
  it('returns only the verdict, graded on the server', async () => {
    findFirst.mockResolvedValue({ content });
    expect(await checkDiagnosticAnswer('di1', 1)).toEqual({ correct: true });
    expect(await checkDiagnosticAnswer('di1', '1')).toEqual({ correct: false });
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({ id: 'di1', status: 'PUBLISHED' });
  });

  it('returns null for an unknown or unpublished item', async () => {
    findFirst.mockResolvedValue(null);
    expect(await checkDiagnosticAnswer('missing', 1)).toBeNull();
  });
});
