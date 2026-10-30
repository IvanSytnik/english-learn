import 'server-only';

import { prisma } from '@englishlearn/db';
import { getConceptProgress } from '@englishlearn/db/queries/learner-progress';
import type { CefrLevelValue, Locale } from '@englishlearn/db/schemas';
import {
  buildConceptProgress,
  type ConceptCategory,
  type ConceptProgressView,
  type ConceptRef,
  type ConceptTheoryView,
  type EffectiveStage,
  getConceptTheory,
} from '@englishlearn/learner-model';
import { isDiagnosticDone } from './diagnostic';
import { contentLocale } from './exercise/view';
import { type DashboardVocab, toDashboardVocab } from './vocab-card';
import { loadVocabOverview } from './vocab-overview';

/**
 * The student dashboard (HANDOFF §9 п. 2): level, the primary CTA by state,
 * whether to show the week, the vocabulary card and the concept list. Read-only — GET /dashboard
 * never writes.
 *
 * Built field by field (a whitelist, like the diagnostic result): nothing
 * from the learner model's internals reaches the page. Plain, serialisable
 * values only, so a concept can be handed to a client component as is.
 */

export type DashboardConcept = {
  id: string;
  title: string;
  category: ConceptCategory;
  cefrLevel: CefrLevelValue;
  stage: EffectiveStage;
  isFading: boolean;
  isLocked: boolean;
  lockedBy: ConceptRef[];
  isRecommendedStart: boolean;
  practicedItemCount: number;
  itemCount: number;
  /** ISO 8601, or null if never practised. */
  lastPracticedAt: string | null;
  requires: ConceptRef[];
  unlocks: ConceptRef[];
  /** Grammar rule reference in the learner's language (contentLocale); null if none. */
  theory: ConceptTheoryView | null;
};

export type DashboardCta =
  | { kind: 'diagnostic' }
  | { kind: 'review'; count: number }
  | { kind: 'practice' };

export type StudentDashboard = {
  diagnosticDone: boolean;
  /** Assessed level, shown only once the diagnostic is done. */
  level: CefrLevelValue | null;
  cta: DashboardCta;
  showWeekRhythm: boolean;
  sections: { category: ConceptCategory; concepts: DashboardConcept[] }[];
  /** Null if the vocabulary read failed: the card is left out. */
  vocab: DashboardVocab | null;
};

/**
 * Before the diagnostic: find the level (even after some practice — the
 * diagnostic seeds the model). After: review if anything is due, else practise.
 */
export function dashboardCta(diagnosticDone: boolean, fadingCount: number): DashboardCta {
  if (!diagnosticDone) return { kind: 'diagnostic' };
  return fadingCount > 0 ? { kind: 'review', count: fadingCount } : { kind: 'practice' };
}

/** `theoryLocale`: the language of the theory text — contentLocale(), not the URL locale. */
export function toDashboardConcept(v: ConceptProgressView, theoryLocale: Locale): DashboardConcept {
  const ref = (r: ConceptRef): ConceptRef => ({ id: r.id, title: r.title });
  return {
    id: v.id,
    title: v.title,
    category: v.category,
    cefrLevel: v.cefrLevel,
    stage: v.stage,
    isFading: v.isFading,
    isLocked: v.isLocked,
    lockedBy: v.lockedBy.map(ref),
    isRecommendedStart: v.isRecommendedStart,
    practicedItemCount: v.practicedItemCount,
    itemCount: v.itemCount,
    lastPracticedAt: v.lastPracticedAt === null ? null : new Date(v.lastPracticedAt).toISOString(),
    requires: v.requires.map(ref),
    unlocks: v.unlocks.map(ref),
    theory: getConceptTheory(v.id, theoryLocale),
  };
}

export async function loadStudentDashboard(args: {
  userId: string;
  locale: Locale;
  nowMs?: number;
}): Promise<StudentDashboard> {
  const nowMs = args.nowMs ?? Date.now();
  const [profile, diagnosticDone, progress, vocab] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { userId: args.userId },
      select: { assessedLevel: true, nativeLanguage: true },
    }),
    isDiagnosticDone(args.userId),
    getConceptProgress(prisma, args.userId, args.locale).catch((e: unknown) => {
      // The list is secondary: without it the CTA still works.
      console.error('[dashboard] concept progress failed', e);
      return null;
    }),
    // In UTC: the server does not know the browser's zone; the card refreshes
    // the day-dependent counts in it after mounting.
    loadVocabOverview({ userId: args.userId, uiLocale: args.locale, timeZone: 'UTC' })
      .then(toDashboardVocab)
      .catch((e: unknown) => {
        // Secondary as well: the dashboard renders without the card.
        console.error('[dashboard] vocabulary overview failed', e);
        return null;
      }),
  ]);

  // A level without a finished diagnostic cannot happen; null either way
  // means no level line and no recommended start.
  const level = diagnosticDone ? (profile?.assessedLevel ?? null) : null;
  const board = progress
    ? buildConceptProgress({
        concepts: progress.concepts,
        masteries: progress.masteries,
        reviews: progress.reviews,
        prereqEdges: progress.prereqEdges,
        level,
        now: nowMs,
      })
    : { sections: [], fadingCount: 0 };

  // The theory is help in the learner's language; titles stay on the URL locale.
  const theoryLocale = contentLocale(profile?.nativeLanguage ?? null, args.locale);
  const sections = board.sections.map((s) => ({
    category: s.category,
    concepts: s.concepts.map((c) => toDashboardConcept(c, theoryLocale)),
  }));
  const practised = sections.some((s) => s.concepts.some((c) => c.practicedItemCount > 0));

  return {
    diagnosticDone,
    level,
    cta: dashboardCta(diagnosticDone, board.fadingCount),
    showWeekRhythm: diagnosticDone || practised,
    sections,
    vocab,
  };
}
