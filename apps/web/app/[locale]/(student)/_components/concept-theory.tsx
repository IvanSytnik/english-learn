import type { ConceptTheoryView } from '@englishlearn/learner-model';
import { focusSegments } from '@/lib/theory';

/**
 * A grammar concept's rule reference: formula, short explanation and
 * examples with their translation. Labels come from the caller's namespace
 * (ConceptSheet, exercise player). The rule parts in each example are bold,
 * not coloured. English stays `lang="en"`; the explanation and translations
 * carry the learner's language.
 */
export function ConceptTheory({
  theory,
  labels,
}: {
  theory: ConceptTheoryView;
  labels: { formula: string; examples: string };
}) {
  return (
    <div className="flex flex-col gap-4" data-theory="">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-ink-muted">{labels.formula}</p>
        <p
          lang="en"
          className="rounded-control border border-line bg-surface px-3 py-2 font-mono text-sm text-ink"
          data-theory-formula=""
        >
          {theory.formula}
        </p>
      </div>
      <p lang={theory.locale} className="text-sm leading-relaxed text-ink" data-theory-summary="">
        {theory.summary}
      </p>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-ink-muted">{labels.examples}</p>
        <ul className="flex flex-col gap-3" data-theory-examples="">
          {theory.examples.map((example) => (
            <li key={example.en} className="flex flex-col gap-0.5">
              <p lang="en" className="font-content text-base text-ink">
                {focusSegments(example.en, example.focus).map((s, i) =>
                  s.focus ? (
                    <strong key={i} className="font-semibold">
                      {s.text}
                    </strong>
                  ) : (
                    s.text
                  ),
                )}
              </p>
              {example.translation ? (
                <p lang={theory.locale} className="text-sm text-ink-muted">
                  {example.translation}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
