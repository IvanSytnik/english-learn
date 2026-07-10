import { describe, expect, it } from 'vitest';
import { computeUnlocked } from '../curriculum';
import { type ConceptMasterySnapshot, DEFAULT_POLICY_CONFIG, type PrereqEdge } from '../types';

const mastery = (conceptId: string, pKnown: number): ConceptMasterySnapshot => ({
  conceptId,
  pKnown,
  observationCount: 5,
  lastUpdatedAt: 0,
  pForgetLambda: 0.01,
});

const prereq = (from: string, to: string): PrereqEdge => ({
  from,
  to,
  kind: 'PREREQUISITE',
});

describe('computeUnlocked', () => {
  it('unlocks a root concept (no prerequisites) for introduction', () => {
    const { unlocked, locked } = computeUnlocked(['past_simple'], [], [], DEFAULT_POLICY_CONFIG);
    expect(unlocked.has('past_simple')).toBe(true);
    expect(locked.size).toBe(0);
  });

  it('locks an unseen concept whose prerequisite is not mastered', () => {
    const edges = [prereq('past_simple', 'present_perfect')];
    const { unlocked, locked } = computeUnlocked(
      ['present_perfect'],
      [mastery('past_simple', 0.3)], // below 0.7 threshold
      edges,
      DEFAULT_POLICY_CONFIG,
    );
    expect(unlocked.has('present_perfect')).toBe(false);
    expect(locked.has('present_perfect')).toBe(true);
  });

  it('unlocks an unseen concept once its prerequisite is mastered', () => {
    const edges = [prereq('past_simple', 'present_perfect')];
    const { unlocked } = computeUnlocked(
      ['present_perfect'],
      [mastery('past_simple', 0.8)],
      edges,
      DEFAULT_POLICY_CONFIG,
    );
    expect(unlocked.has('present_perfect')).toBe(true);
  });

  it('review regime: an already-started concept is NEVER gated', () => {
    // present_perfect already has a mastery snapshot but its prereq is weak.
    const edges = [prereq('past_simple', 'present_perfect')];
    const { unlocked, locked } = computeUnlocked(
      ['present_perfect'],
      [mastery('past_simple', 0.2), mastery('present_perfect', 0.5)],
      edges,
      DEFAULT_POLICY_CONFIG,
    );
    expect(unlocked.has('present_perfect')).toBe(true);
    expect(locked.has('present_perfect')).toBe(false);
  });

  it('requires ALL prerequisites mastered (multi-parent)', () => {
    const edges = [prereq('a', 'target'), prereq('b', 'target')];
    // a mastered, b not => still locked
    const partial = computeUnlocked(
      ['target'],
      [mastery('a', 0.9), mastery('b', 0.4)],
      edges,
      DEFAULT_POLICY_CONFIG,
    );
    expect(partial.unlocked.has('target')).toBe(false);

    // both mastered => unlocked
    const full = computeUnlocked(
      ['target'],
      [mastery('a', 0.9), mastery('b', 0.9)],
      edges,
      DEFAULT_POLICY_CONFIG,
    );
    expect(full.unlocked.has('target')).toBe(true);
  });

  it('ignores non-PREREQUISITE edges', () => {
    const edges: PrereqEdge[] = [{ from: 'x', to: 'target', kind: 'RELATED' }];
    const { unlocked } = computeUnlocked(
      ['target'],
      [], // x not mastered, but edge is RELATED not PREREQUISITE
      edges,
      DEFAULT_POLICY_CONFIG,
    );
    expect(unlocked.has('target')).toBe(true);
  });
});
