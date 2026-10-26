'use client';

import { Card, StageLabel } from '@englishlearn/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { DashboardConcept, StudentDashboard } from '@/lib/dashboard';
import { ConceptSheet, lockText } from './concept-sheet';

/** The dashboard's topics by section; a topic opens its ConceptSheet. */
export function ConceptList({
  sections,
  diagnosticDone,
}: {
  sections: StudentDashboard['sections'];
  diagnosticDone: boolean;
}) {
  const t = useTranslations('student.dashboard');
  const [openId, setOpenId] = useState<string | null>(null);
  const open = sections.flatMap((s) => s.concepts).find((c) => c.id === openId) ?? null;

  return (
    <>
      {sections.map((section) => (
        <section
          key={section.category}
          aria-labelledby={`topics-${section.category}`}
          className="mb-8"
        >
          <h2 id={`topics-${section.category}`} className="mb-3 font-content text-xl text-ink">
            {t('category', { category: section.category })}
          </h2>
          <Card>
            <ul className="divide-y divide-line">
              {section.concepts.map((concept) => (
                <li key={concept.id}>
                  <ConceptRow concept={concept} onOpen={() => setOpenId(concept.id)} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
      <ConceptSheet
        concept={open}
        diagnosticDone={diagnosticDone}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function ConceptRow({ concept, onOpen }: { concept: DashboardConcept; onOpen: () => void }) {
  const t = useTranslations('student.dashboard');
  const ts = useTranslations('learning.stage');
  const format = useFormatter();

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      data-concept={concept.id}
      data-locked={concept.isLocked}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{concept.title}</span>
        <span className="rounded-control border border-line px-1.5 font-mono text-xs text-ink-muted">
          {concept.cefrLevel}
        </span>
        {concept.isRecommendedStart ? (
          <span
            className="rounded-control border border-accent px-1.5 text-xs font-medium text-accent"
            data-recommended-start
          >
            {t('recommendedStart')}
          </span>
        ) : null}
      </span>
      {concept.isLocked ? (
        <span className="text-sm text-ink-muted">{lockText(concept, t, format)}</span>
      ) : (
        <StageLabel
          stage={concept.stage}
          label={ts(concept.stage)}
          fading={concept.isFading}
          fadingLabel={ts('dueForReview')}
        />
      )}
    </button>
  );
}
