'use client';

import type { NativeLanguage } from '@englishlearn/db/schemas';
import { cn, KeyHint, SegmentedProgress } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from 'react';
import { Link } from '@/i18n/navigation';
import type {
  DiagnosticPeek,
  DiagnosticQuestionView,
  DiagnosticResultView,
} from '@/lib/diagnostic';
import { focusKind, resolveShortcut } from '@/lib/exercise/shortcuts';
import {
  saveNativeLanguageAction,
  startDiagnosticAction,
  submitDiagnosticAnswerAction,
} from './actions';

const GAP = '___';

const primaryButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control bg-accent px-5 text-sm font-medium text-on-accent transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';
const quietButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control border border-line px-4 text-sm font-medium text-ink transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';

/**
 * The native-language choices, in a fixed order. Endonyms are constants, not
 * `Intl.DisplayNames` (its casing differs between Node and browsers — a
 * hydration mismatch); "Other" is a message in the interface language.
 */
const LANGUAGE_CHOICES: readonly { code: NativeLanguage; endonym: string | null }[] = [
  { code: 'ru', endonym: 'Русский' },
  { code: 'uk', endonym: 'Українська' },
  { code: 'de', endonym: 'Deutsch' },
  { code: 'other', endonym: null },
];

/** Client view of the diagnostic: (language →) intro → questions → done, or unavailable. */
export type DiagnosticView = DiagnosticPeek | { kind: 'unavailable' };
type View = DiagnosticView;

/**
 * The placement test. The server decides every step (the ladder replays the
 * stored answers); this component only shows it and sends answers. No
 * feedback during the test: after an answer the next question appears.
 */
export function DiagnosticFlow({ initial }: { initial: View }) {
  const [view, setView] = useState<View>(initial);
  // Set once the learner moves between steps here (not on page load): the
  // new step's heading then takes focus.
  const [moved, setMoved] = useState(false);
  const [pending, startTransition] = useTransition();

  const show = useCallback((next: View) => {
    setMoved(true);
    setView(next);
  }, []);

  const start = useCallback(() => {
    startTransition(async () => {
      const res = await startDiagnosticAction();
      if (res.ok) show(res.value);
      else show({ kind: res.error === 'NEEDS_LANGUAGE' ? 'language' : 'unavailable' });
    });
  }, [show]);

  switch (view.kind) {
    case 'language':
      return <LanguageStep onSaved={show} focusHeading={moved} />;
    case 'intro':
      return <Intro onStart={start} pending={pending} focusHeading={moved} />;
    case 'question':
      return (
        <Player
          key={view.question.attemptId}
          question={view.question}
          onStep={setView}
          onUnavailable={() => setView({ kind: 'unavailable' })}
        />
      );
    case 'completed':
      return <Done result={view.result} />;
    case 'unavailable':
      return <Unavailable />;
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[62ch] flex-col gap-6 px-4 py-6">{children}</main>
  );
}

/**
 * The learner's native language, asked once before the first attempt.
 * Nothing is preselected — never guessed from the interface language — and
 * the choice is sent only on Continue. Native radios, no global shortcuts.
 */
function LanguageStep({
  onSaved,
  focusHeading,
}: {
  onSaved: (view: View) => void;
  focusHeading: boolean;
}) {
  const t = useTranslations('student.diagnostic');
  const [selected, setSelected] = useState<NativeLanguage | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const sending = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    // One save per choice: a second Enter or click while sending does nothing.
    if (selected === null || sending.current) return;
    sending.current = true;
    setError(false);
    startTransition(async () => {
      const res = await saveNativeLanguageAction({ language: selected });
      sending.current = false;
      if (res.ok) onSaved(res.value);
      else setError(true);
    });
  };

  return (
    <Shell>
      <form onSubmit={save} className="flex flex-col gap-6">
        <h1
          id="native-language-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-content text-3xl text-ink outline-none"
        >
          {t('languageTitle')}
        </h1>
        <p id="native-language-why" className="text-ink">
          {t('languageWhy')}
        </p>
        <fieldset
          aria-labelledby="native-language-title"
          aria-describedby="native-language-why"
          className="flex flex-col gap-2"
        >
          {LANGUAGE_CHOICES.map(({ code, endonym }) => (
            <label
              key={code}
              className={cn(
                'flex w-full cursor-pointer items-center gap-3 rounded-control border bg-surface px-4 py-3 text-left shadow-soft transition-colors duration-(--duration-fast) ease-standard',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                selected === code ? 'border-accent bg-surface-2 ring-1 ring-accent' : 'border-line',
                pending ? 'cursor-default' : 'hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                name="nativeLanguage"
                value={code}
                checked={selected === code}
                onChange={() => setSelected(code)}
                disabled={pending}
                className="sr-only"
              />
              {endonym ? (
                <span lang={code} className="flex-1 text-lg text-ink">
                  {endonym}
                </span>
              ) : (
                <span className="flex-1 text-lg text-ink">{t('languageOther')}</span>
              )}
            </label>
          ))}
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm text-feedback-incorrect">
            {t('languageError')}
          </p>
        ) : null}
        <div>
          <button type="submit" className={primaryButton} disabled={pending || selected === null}>
            {t('languageContinue')}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Intro({
  onStart,
  pending,
  focusHeading,
}: {
  onStart: () => void;
  pending: boolean;
  focusHeading: boolean;
}) {
  const t = useTranslations('student.diagnostic');
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);
  return (
    <Shell>
      <h1 ref={headingRef} tabIndex={-1} className="font-content text-3xl text-ink outline-none">
        {t('title')}
      </h1>
      <div className="flex flex-col gap-3 text-ink">
        <p>{t('intro')}</p>
        <p>{t('introNoGrades')}</p>
        <p>{t('introDontKnow')}</p>
      </div>
      <div>
        <button type="button" className={primaryButton} onClick={onStart} disabled={pending}>
          {t('start')}
        </button>
      </div>
    </Shell>
  );
}

/** One question at a time; a new question arrives with each answer. */
function Player({
  question: initialQuestion,
  onStep,
  onUnavailable,
}: {
  question: DiagnosticQuestionView;
  onStep: (view: View) => void;
  onUnavailable: () => void;
}) {
  const t = useTranslations('student.diagnostic');
  const [question, setQuestion] = useState(initialQuestion);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const stemRef = useRef<HTMLDivElement>(null);
  const sending = useRef(false);

  // Every new question: focus its stem (the live region announces "N of 16").
  useEffect(() => {
    stemRef.current?.focus();
  }, [question.position]);

  const send = useCallback(
    (answer: { choiceIndex: number } | { dontKnow: true }) => {
      // One answer per question: a second Enter while sending does nothing.
      if (sending.current) return;
      sending.current = true;
      setError(false);
      startTransition(async () => {
        const res = await submitDiagnosticAnswerAction({
          attemptId: question.attemptId,
          position: question.position,
          itemId: question.item.id,
          ...answer,
        });
        sending.current = false;
        if (!res.ok) {
          if (res.error === 'BANK_EXHAUSTED' || res.error === 'NOT_IN_PROGRESS') onUnavailable();
          else setError(true);
          return;
        }
        // Stale (another tab moved on) or not: show whatever the server says is next.
        const { step } = res.value;
        if (step.kind === 'question') {
          setQuestion(step.question);
          setSelected(null);
        } else {
          onStep(step);
        }
      });
    },
    [question, onStep, onUnavailable],
  );

  const answer = useCallback(() => {
    if (selected !== null) send({ choiceIndex: selected });
  }, [selected, send]);

  // Reads the current question and state even for a key pressed right after a
  // commit, before effects run — attached once, never a frame behind.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const action = resolveShortcut(event, {
      // The ref, not `pending`: it is set the moment an answer goes out and
      // cleared before the next question shows, while the transition's
      // `pending` can still read true for a moment after that.
      phase: sending.current ? 'submitting' : 'answering',
      ...focusKind(event.target),
      optionCount: question.item.choices.length,
      hasHint: false,
    });
    if (!action) return;
    switch (action.type) {
      case 'select':
        event.preventDefault();
        setSelected(action.index);
        break;
      case 'dontKnow':
        event.preventDefault();
        send({ dontKnow: true });
        break;
      case 'enter':
        event.preventDefault();
        answer();
        break;
      // No pause, hint or "why" in the test: Esc, H and ? do nothing here.
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const [before, after] = question.item.stem.split(GAP);
  const gap = (
    <span className="mx-1 inline-block min-w-[4ch] border-b-2 border-ink px-1 text-center">
      {selected !== null ? question.item.choices[selected] : ' '}
    </span>
  );

  return (
    <Shell>
      <header className="flex flex-col gap-3">
        <SegmentedProgress
          total={question.total}
          completed={question.position}
          label={t('progress')}
          valueText={t('progressValue', { done: question.position, total: question.total })}
        />
        <p role="status" aria-live="polite" className="text-sm font-medium text-ink-muted">
          {t('questionOf', { n: question.position + 1, total: question.total })}
        </p>
      </header>

      <section aria-labelledby="diagnostic-stem" className="flex flex-col gap-5">
        <p className="text-sm text-ink-muted">{t('chooseInstruction')}</p>
        <div
          id="diagnostic-stem"
          ref={stemRef}
          tabIndex={-1}
          lang="en"
          className="font-content text-[1.5rem] leading-snug text-ink outline-none sm:text-[1.625rem]"
        >
          {after === undefined ? (
            question.item.stem
          ) : (
            <>
              {before}
              {gap}
              {after}
            </>
          )}
        </div>

        <fieldset aria-labelledby="diagnostic-stem" className="flex flex-col gap-2">
          {question.item.choices.map((choice, index) => (
            <label
              key={choice}
              className={cn(
                'flex w-full cursor-pointer items-center gap-3 rounded-control border bg-surface px-4 py-3 text-left shadow-soft transition-colors duration-(--duration-fast) ease-standard',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                selected === index
                  ? 'border-accent bg-surface-2 ring-1 ring-accent'
                  : 'border-line',
                pending ? 'cursor-default' : 'hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                name={`diagnostic-${question.attemptId}-${question.position}`}
                value={index}
                checked={selected === index}
                onChange={() => setSelected(index)}
                disabled={pending}
                data-player-option=""
                className="sr-only"
              />
              <KeyHint>{String(index + 1)}</KeyHint>
              <span lang="en" className="flex-1 font-content text-lg text-ink">
                {choice}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={primaryButton}
            onClick={answer}
            disabled={pending || selected === null}
          >
            {t('answer')}
            <KeyHint className="border-transparent bg-transparent text-on-accent">Enter</KeyHint>
          </button>
          <button
            type="button"
            className={quietButton}
            onClick={() => send({ dontKnow: true })}
            disabled={pending}
          >
            {t('dontKnow')}
            <KeyHint>0</KeyHint>
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-feedback-incorrect">
            {t('error')}
          </p>
        ) : null}
      </section>
    </Shell>
  );
}

/** The result: levels in words and CEFR codes only — no counts, no scores. */
function Done({ result }: { result: DiagnosticResultView }) {
  const t = useTranslations('student.diagnostic');
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <Shell>
      <h1 ref={headingRef} tabIndex={-1} className="font-content text-3xl text-ink outline-none">
        {t('doneTitle')}
      </h1>
      {result.level ? (
        <>
          <p className="text-ink">{t('doneText')}</p>
          <section aria-labelledby="diagnostic-level" className="flex flex-col gap-2">
            <h2 id="diagnostic-level" className="text-sm text-ink-muted">
              {t('resultTitle')}
            </h2>
            <p className="font-content text-5xl text-ink" data-result-level>
              {result.level}
            </p>
            {result.axes.length > 0 ? (
              <p className="text-ink">
                {result.axes
                  .map((a) => t('axisLevel', { axis: a.axis, level: a.level }))
                  .join(' · ')}
              </p>
            ) : null}
          </section>
          {result.startConcept ? (
            <p className="text-ink">{t('recommendStart', { title: result.startConcept.title })}</p>
          ) : null}
        </>
      ) : (
        <p className="text-ink">{t('resultUnavailable')}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/exercises" className={primaryButton}>
          {t('goToPractice')}
        </Link>
        {/* No prefetch: the key and the explanations load only when asked for. */}
        <Link href="/diagnostic/review" prefetch={false} className={quietButton}>
          {t('reviewLink')}
        </Link>
      </div>
    </Shell>
  );
}

function Unavailable() {
  const t = useTranslations('student.diagnostic');
  return (
    <Shell>
      <h1 className="font-content text-3xl text-ink">{t('unavailableTitle')}</h1>
      <p className="text-ink">{t('unavailable')}</p>
      <div>
        <Link href="/exercises" className={primaryButton}>
          {t('goToPractice')}
        </Link>
      </div>
    </Shell>
  );
}
