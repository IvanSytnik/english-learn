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

  it('a parent past the threshold opens the gate only from its third outcome (§8 #19)', () => {
    const edges = [prereq('past_simple', 'present_perfect')];
    const gateAt = (observationCount: number) =>
      computeUnlocked(
        ['present_perfect'],
        [{ ...mastery('past_simple', 0.95), observationCount }],
        edges,
        DEFAULT_POLICY_CONFIG,
      ).unlocked.has('present_perfect');
    expect(DEFAULT_POLICY_CONFIG.prereqMinObservations).toBe(3);
    expect([0, 1, 2, 3, 4].map(gateAt)).toEqual([false, false, false, true, true]);
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

  it('unlockedBy lists every direct parent (sorted) only for introduction-unlocked concepts', () => {
    const edges = [
      prereq('past_simple', 'present_perfect'),
      prereq('past_participle', 'present_perfect'),
      prereq('present_perfect', 'present_perfect_continuous'),
    ];
    const { unlockedBy } = computeUnlocked(
      ['past_simple', 'present_perfect', 'present_perfect_continuous'],
      [
        mastery('past_simple', 0.8),
        mastery('past_participle', 0.75),
        mastery('present_perfect_continuous', 0.3), // started → review regime
        mastery('present_perfect', 0.5),
      ],
      edges,
      DEFAULT_POLICY_CONFIG,
    );
    expect(unlockedBy.has('past_simple')).toBe(false); // root
    expect(unlockedBy.has('present_perfect')).toBe(false); // started
    expect(unlockedBy.has('present_perfect_continuous')).toBe(false); // started
  });

  it('unlockedBy names the parents that opened the gate for a new concept', () => {
    const edges = [
      prereq('past_simple', 'present_perfect'),
      prereq('past_participle', 'present_perfect'),
    ];
    const { unlockedBy } = computeUnlocked(
      ['present_perfect'],
      [mastery('past_simple', 0.8), mastery('past_participle', 0.75)],
      edges,
      DEFAULT_POLICY_CONFIG,
    );
    expect(unlockedBy.get('present_perfect')).toEqual(['past_participle', 'past_simple']);
  });

  it('a bootstrap snapshot (observationCount 0) does not count as started', () => {
    // LEARNER_BOOTSTRAPPED writes a prior for both concepts; neither has been
    // practised, so present_perfect stays introduction-gated behind past_simple.
    const edges = [prereq('past_simple', 'present_perfect')];
    const { unlocked, locked } = computeUnlocked(
      ['past_simple', 'present_perfect'],
      [
        { ...mastery('past_simple', 0.6), observationCount: 0 },
        { ...mastery('present_perfect', 0.6), observationCount: 0 },
      ],
      edges,
      DEFAULT_POLICY_CONFIG,
    );
    expect(unlocked.has('past_simple')).toBe(true);
    expect(locked.has('present_perfect')).toBe(true);
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
