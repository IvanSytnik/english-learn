'use client';

import { cn, KeyHint, ReasonChip, SegmentedProgress } from '@englishlearn/ui';
import { Check, CircleHelp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { focusKind, type PlayerPhase, resolveShortcut } from '@/lib/exercise/shortcuts';
import type {
  ExerciseAnswer,
  ExerciseFeedback,
  ExerciseView,
  ReasonDetail,
} from '@/lib/exercise/view';
import { nextExercise, submitExerciseAttempt } from './actions';

const GAP = '___';

const primaryButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control bg-accent px-5 text-sm font-medium text-on-accent transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';
const quietButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control border border-line px-4 text-sm font-medium text-ink transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';

export function ExercisePlayer({
  initial,
  sessionLength,
}: {
  initial: ExerciseView;
  sessionLength: number;
}) {
  const t = useTranslations('learning');
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [view, setView] = useState(initial);
  const [phase, setPhase] = useState<PlayerPhase>('answering');
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [hintOpen, setHintOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [feedback, setFeedback] = useState<ExerciseFeedback | null>(null);
  const [completed, setCompleted] = useState(0);
  const [recent, setRecent] = useState<string[]>([initial.itemId]);
  const [error, setError] = useState(false);

  const shownAt = useRef(Date.now());
  const promptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const question = view.question;
  const optionCount = question.type === 'choice' ? question.options.length : 0;

  // Move focus where the next action is: the answer field / prompt for a new
  // question, Continue once feedback is in.
  useEffect(() => {
    if (phase === 'answering') {
      if (question.type === 'cloze') inputRef.current?.focus();
      else promptRef.current?.focus();
    }
    if (phase === 'feedback') continueRef.current?.focus();
  }, [phase, question.type]);

  const submit = useCallback(
    (answer: ExerciseAnswer) => {
      if (phase !== 'answering') return;
      setPhase('submitting');
      setError(false);
      const timeMs = Math.max(1, Date.now() - shownAt.current);
      startTransition(async () => {
        const res = await submitExerciseAttempt({ itemId: view.itemId, answer, timeMs });
        if (!res.ok) {
          setError(true);
          setPhase('answering');
          return;
        }
        setFeedback(res.value);
        setCompleted((n) => n + 1);
        setPhase('feedback');
      });
    },
    [phase, view.itemId],
  );

  const check = useCallback(() => {
    if (question.type === 'choice') {
      if (selected !== null) submit({ type: 'choice', index: selected });
    } else if (text.trim().length > 0) {
      submit({ type: 'text', value: text });
    }
  }, [question.type, selected, text, submit]);

  const loadNext = useCallback((recentIds: string[]) => {
    setPhase('loading');
    setError(false);
    startTransition(async () => {
      const res = await nextExercise(recentIds);
      if (!res.ok) {
        setError(true);
        setPhase('feedback');
        return;
      }
      if (!res.value) {
        setPhase('done');
        return;
      }
      const next = res.value;
      setView(next);
      setRecent((ids) => [...ids, next.itemId].slice(-10));
      setSelected(null);
      setText('');
      setHintOpen(false);
      setWhyOpen(false);
      setFeedback(null);
      shownAt.current = Date.now();
      setPhase('answering');
    });
  }, []);

  const goOn = useCallback(() => {
    if (phase !== 'feedback') return;
    if (completed >= sessionLength) setPhase('done');
    else loadNext(recent);
  }, [phase, completed, sessionLength, loadNext, recent]);

  const startAgain = useCallback(() => {
    setCompleted(0);
    loadNext(recent);
  }, [loadNext, recent]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = resolveShortcut(event, {
        phase,
        ...focusKind(event.target),
        optionCount,
        hasHint: view.hint !== null,
      });
      if (!action) return;
      event.preventDefault();
      switch (action.type) {
        case 'pause':
          router.push('/dashboard');
          break;
        case 'enter':
          if (phase === 'answering') check();
          else goOn();
          break;
        case 'select':
          setSelected(action.index);
          break;
        case 'dontKnow':
          submit({ type: 'dontKnow' });
          break;
        case 'toggleHint':
          setHintOpen((open) => !open);
          break;
        case 'toggleWhy':
          setWhyOpen((open) => !open);
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, optionCount, view.hint, router, check, goOn, submit]);

  if (phase === 'done') {
    return (
      <main className="mx-auto w-full max-w-[62ch] px-4 py-12">
        <h1 className="font-content text-3xl text-ink">{t('player.done.title')}</h1>
        <p className="mt-3 text-ink-muted">{t('player.done.body', { count: completed })}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" className={primaryButton} onClick={startAgain}>
            {t('player.done.again')}
          </button>
          <Link href="/dashboard" className={quietButton}>
            {t('player.done.dashboard')}
          </Link>
        </div>
      </main>
    );
  }

  const answered = phase === 'feedback' || (phase === 'loading' && feedback !== null);
  const gapFill = feedback
    ? feedback.correctAnswer
    : question.type === 'choice' && selected !== null
      ? question.options[selected]
      : null;

  return (
    <main className="mx-auto flex w-full max-w-[62ch] flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-3">
        <SegmentedProgress
          total={sessionLength}
          completed={completed}
          label={t('session.progress')}
          valueText={t('session.progressValue', { done: completed, total: sessionLength })}
        />
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <ReasonChip
              reason={view.reason}
              isNewConcept={view.isNewConcept}
              labels={{
                review: t('reason.review'),
                new: t('reason.new'),
                checkIn: t('reason.checkIn'),
              }}
              detail={detailText(view.detail, t)}
            />
            <p className="text-sm font-medium text-ink">{view.conceptTitle}</p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex shrink-0 items-center gap-2 text-sm text-ink-muted hover:text-ink"
          >
            {t('player.pause')}
            <KeyHint>Esc</KeyHint>
          </Link>
        </div>
      </header>

      <section aria-labelledby="exercise-prompt" className="flex flex-col gap-5">
        <p className="text-sm text-ink-muted">
          {question.type === 'choice' ? t('player.chooseInstruction') : t('player.typeInstruction')}
        </p>
        <div
          id="exercise-prompt"
          ref={promptRef}
          tabIndex={-1}
          lang="en"
          className="font-content text-[1.5rem] leading-snug text-ink outline-none sm:text-[1.625rem]"
        >
          <Prompt
            prompt={question.prompt}
            gap={
              question.type === 'cloze' && !answered ? (
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={phase !== 'answering'}
                  aria-label={t('player.answerLabel')}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="mx-1 inline-block w-[9ch] border-0 border-b-2 border-ink bg-transparent px-1 text-center font-content text-ink outline-none focus:border-accent"
                />
              ) : (
                <span
                  className={cn(
                    'mx-1 inline-block min-w-[4ch] border-b-2 px-1 text-center',
                    feedback ? 'border-feedback-correct' : 'border-ink',
                  )}
                >
                  {gapFill ?? ' '}
                </span>
              )
            }
          />
        </div>

        {question.type === 'choice' ? (
          <ul className="flex flex-col gap-2">
            {question.options.map((option, index) => {
              const isCorrect = feedback?.correctIndex === index;
              const isWrongPick = feedback !== null && feedback.chosenIndex === index && !isCorrect;
              return (
                <li key={option}>
                  <button
                    type="button"
                    data-player-option=""
                    aria-pressed={selected === index}
                    disabled={phase !== 'answering'}
                    onClick={() => setSelected(index)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-control border bg-surface px-4 py-3 text-left shadow-soft transition-colors duration-(--duration-fast) ease-standard',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                      selected === index && !feedback
                        ? 'border-accent bg-surface-2 ring-1 ring-accent'
                        : 'border-line',
                      phase === 'answering' && 'hover:bg-surface-2',
                      isCorrect && 'border-feedback-correct',
                      isWrongPick && 'border-feedback-incorrect',
                    )}
                  >
                    <KeyHint>{String(index + 1)}</KeyHint>
                    <span lang="en" className="flex-1 font-content text-lg text-ink">
                      {option}
                    </span>
                    {isCorrect ? (
                      <Check aria-hidden="true" className="size-5 text-feedback-correct" />
                    ) : null}
                    {isWrongPick ? (
                      <X aria-hidden="true" className="size-5 text-feedback-incorrect" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {hintOpen && view.hint && !answered ? (
          <p className="rounded-control bg-surface-2 px-4 py-3 text-sm text-ink">{view.hint}</p>
        ) : null}

        {!answered ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primaryButton}
              onClick={check}
              disabled={
                phase !== 'answering' ||
                (question.type === 'choice' ? selected === null : text.trim().length === 0)
              }
            >
              {t('player.check')}
              <KeyHint className="border-transparent bg-transparent text-on-accent">Enter</KeyHint>
            </button>
            <button
              type="button"
              className={quietButton}
              onClick={() => submit({ type: 'dontKnow' })}
              disabled={phase !== 'answering'}
            >
              {t('player.dontKnow')}
              <KeyHint>0</KeyHint>
            </button>
            {view.hint ? (
              <button
                type="button"
                className={quietButton}
                aria-expanded={hintOpen}
                onClick={() => setHintOpen((open) => !open)}
                disabled={phase !== 'answering'}
              >
                {t('player.hint')}
                <KeyHint>H</KeyHint>
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-feedback-incorrect">
            {t('player.error')}
          </p>
        ) : null}
      </section>

      <div aria-live="polite" role="status">
        {feedback ? (
          <Feedback
            feedback={feedback}
            whyOpen={whyOpen}
            onToggleWhy={() => setWhyOpen((open) => !open)}
            onContinue={goOn}
            continueRef={continueRef}
            busy={phase === 'loading'}
          />
        ) : null}
      </div>
    </main>
  );
}

function Prompt({ prompt, gap }: { prompt: string; gap: ReactNode }) {
  const [before, after] = prompt.split(GAP);
  if (after === undefined) return <>{prompt}</>;
  return (
    <>
      {before}
      {gap}
      {after}
    </>
  );
}

type T = ReturnType<typeof useTranslations<'learning'>>;

function detailText(detail: ReasonDetail, t: T): string | undefined {
  if (!detail) return undefined;
  return detail.kind === 'lastPractised'
    ? t('reason.lastPractised', { days: detail.days })
    : t('reason.unlockedBy', { concept: detail.concepts.join(', ') });
}

function Feedback({
  feedback,
  whyOpen,
  onToggleWhy,
  onContinue,
  continueRef,
  busy,
}: {
  feedback: ExerciseFeedback;
  whyOpen: boolean;
  onToggleWhy: () => void;
  onContinue: () => void;
  continueRef: React.RefObject<HTMLButtonElement | null>;
  busy: boolean;
}) {
  const t = useTranslations('learning');
  const { verdict, consequence } = feedback;
  const Icon = verdict === 'correct' ? Check : verdict === 'incorrect' ? X : CircleHelp;
  const tone =
    verdict === 'correct'
      ? 'text-feedback-correct'
      : verdict === 'incorrect'
        ? 'text-feedback-incorrect'
        : 'text-ink-muted';

  const consequenceText =
    consequence.kind === 'stageCrossed'
      ? t('player.stageCrossed', {
          concept: consequence.concept,
          stage: t(`stage.${consequence.stage}`),
        })
      : consequence.kind === 'backSoon'
        ? t('feedback.backSoon')
        : t('feedback.backInDays', { days: consequence.days });

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface-2 p-4 shadow-soft">
      <p data-verdict={verdict} className={cn('flex items-center gap-2 font-medium', tone)}>
        <Icon aria-hidden="true" className="size-5" />
        {t(`player.verdict.${verdict}`)}
      </p>
      <p lang="en" className="font-content text-lg text-ink">
        {feedback.answerSentence}
      </p>
      {verdict !== 'correct' ? (
        <p className="text-sm text-ink-muted">
          {t('player.answerIs', { answer: feedback.correctAnswer })}
        </p>
      ) : null}
      {feedback.why ? <p className="text-sm text-ink">{feedback.why}</p> : null}
      {feedback.more ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={whyOpen}
            onClick={onToggleWhy}
            className="inline-flex items-center gap-2 self-start text-sm text-ink-muted hover:text-ink"
          >
            {t('player.why')}
            <KeyHint>?</KeyHint>
          </button>
          {whyOpen ? <p className="text-sm text-ink">{feedback.more}</p> : null}
        </div>
      ) : null}
      <p
        data-consequence={consequence.kind}
        className={cn(
          'text-sm',
          consequence.kind === 'stageCrossed' ? 'font-medium text-accent' : 'text-ink-muted',
        )}
      >
        {consequenceText}
      </p>
      <div>
        <button
          ref={continueRef}
          type="button"
          className={primaryButton}
          onClick={onContinue}
          disabled={busy}
        >
          {t('player.continue')}
          <KeyHint className="border-transparent bg-transparent text-on-accent">Enter</KeyHint>
        </button>
      </div>
    </div>
  );
}
