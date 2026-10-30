'use client';

import { cn, KeyHint, ReasonChip, SegmentedProgress } from '@englishlearn/ui';
import { Check, CircleHelp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { focusKind, type PlayerPhase, resolveShortcut } from '@/lib/exercise/shortcuts';
import { type SessionEntry, summarizeSession, toSessionEntry } from '@/lib/exercise/summary';
import type {
  ExerciseAnswer,
  ExerciseFeedback,
  ExerciseView,
  ReasonDetail,
} from '@/lib/exercise/view';
import { ConceptTheory } from '../_components/concept-theory';
import { FeedbackDialog } from '../_components/feedback-dialog';
import { WeekRhythmPanel } from '../_components/week-rhythm-panel';
import { nextExercise, submitExerciseAttempt } from './actions';
import { SessionSummary } from './session-summary';

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
  const tf = useTranslations('feedback');
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Concepts whose rule card was already shown this session: the intro comes
  // once per concept, before its first question (B3.2).
  const introSeen = useRef(new Set<string>());
  const needsIntro = useCallback(
    (v: ExerciseView) => v.isNewConcept && v.theory !== null && !introSeen.current.has(v.conceptId),
    [],
  );

  const [view, setView] = useState(initial);
  const [phase, setPhase] = useState<PlayerPhase>(() =>
    needsIntro(initial) ? 'theory' : 'answering',
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [hintOpen, setHintOpen] = useState(false);
  // The rule card reopened during a question. General reference, not this
  // item's answer: unlike the `H` hint it does not mark the answer hinted.
  const [ruleOpen, setRuleOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [feedback, setFeedback] = useState<ExerciseFeedback | null>(null);
  // Length is client-enforced by design (§8 #9); allowlist guards the input,
  // not the session. The server keeps no session state to check this against.
  const [completed, setCompleted] = useState(0);
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [recent, setRecent] = useState<string[]>([initial.itemRef]);
  const [error, setError] = useState(false);
  // An answer whose request never came back (network drop, server down) —
  // offered for resending as is. Cleared by the next send.
  const [unsent, setUnsent] = useState<{ answer: ExerciseAnswer; timeMs: number } | null>(null);
  // The next question never came back (network drop): feedback stays, with a
  // Retry. Cleared by the next load.
  const [nextFailed, setNextFailed] = useState(false);
  // The "Report an issue" dialog, about the question on screen.
  const [reportOpen, setReportOpen] = useState(false);

  const shownAt = useRef(Date.now());
  // One request at a time. Set synchronously before calling an action, so a
  // second key in the same tick — before `phase` re-renders — is refused;
  // cleared as soon as the reply is in. `phase` keeps driving the UI.
  const busy = useRef(false);
  // The hint was opened on this question, even if closed again (§8 #11). Set
  // synchronously on the toggle — the first toggle of a question always opens
  // it — so an answer in the same tick still carries it; reset with the next
  // question.
  const hintUsed = useRef(false);
  // Idempotency key of this question, made on its first send and kept by
  // every resend, so the server records the answer once even if a reply was
  // lost after the write. A new one with the next question.
  const attemptKey = useRef<string | null>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const nextRetryRef = useRef<HTMLButtonElement>(null);

  const question = view.question;
  const optionCount = question.type === 'choice' ? question.options.length : 0;

  // Move focus where the next action is: the answer field / prompt for a new
  // question, Retry after a lost request, Continue once feedback is in.
  const hasUnsent = unsent !== null;
  useEffect(() => {
    if (phase === 'theory') startRef.current?.focus();
    if (phase === 'answering') {
      if (hasUnsent) retryRef.current?.focus();
      else if (question.type === 'cloze') inputRef.current?.focus();
      else promptRef.current?.focus();
    }
    if (phase === 'feedback') (nextFailed ? nextRetryRef : continueRef).current?.focus();
  }, [phase, question.type, hasUnsent, nextFailed]);

  const submit = useCallback(
    (answer: ExerciseAnswer, resendTimeMs?: number) => {
      if (phase !== 'answering' || busy.current) return;
      busy.current = true;
      setPhase('submitting');
      setError(false);
      setUnsent(null);
      // A resend keeps the time of the first send: the wait is not thinking.
      const timeMs = resendTimeMs ?? Math.max(1, Date.now() - shownAt.current);
      attemptKey.current ??= crypto.randomUUID();
      const request = {
        itemRef: view.itemRef,
        answer,
        timeMs,
        hinted: hintUsed.current,
        attemptKey: attemptKey.current,
      };
      startTransition(async () => {
        let res: Awaited<ReturnType<typeof submitExerciseAttempt>>;
        try {
          res = await submitExerciseAttempt(request);
        } catch {
          // No reply: the answer may or may not be recorded. Resending with
          // the same key is safe either way.
          busy.current = false;
          setUnsent({ answer, timeMs });
          setPhase('answering');
          return;
        }
        busy.current = false;
        if (!res.ok) {
          setError(true);
          setPhase('answering');
          return;
        }
        setFeedback(res.value);
        setCompleted((n) => n + 1);
        setEntries((list) => [...list, toSessionEntry(view.conceptTitle, res.value)]);
        setPhase('feedback');
      });
    },
    [phase, view.itemRef, view.conceptTitle],
  );

  const check = useCallback(() => {
    if (question.type === 'choice') {
      if (selected !== null) submit({ type: 'choice', index: selected });
    } else if (text.trim().length > 0) {
      submit({ type: 'text', value: text });
    }
  }, [question.type, selected, text, submit]);

  // Leave the rule card for the question. The answer clock starts here, so
  // reading the rule is not counted as thinking time.
  const startQuestions = useCallback(() => {
    if (phase !== 'theory') return;
    introSeen.current.add(view.conceptId);
    shownAt.current = Date.now();
    setPhase('answering');
  }, [phase, view.conceptId]);

  const toggleHint = useCallback(() => {
    if (phase !== 'answering' || view.hint === null) return;
    hintUsed.current = true;
    setHintOpen((open) => !open);
  }, [phase, view.hint]);

  const loadNext = useCallback(
    (recentRefs: string[]) => {
      if (busy.current) return;
      busy.current = true;
      setPhase('loading');
      setError(false);
      setNextFailed(false);
      startTransition(async () => {
        let res: Awaited<ReturnType<typeof nextExercise>>;
        try {
          res = await nextExercise(recentRefs);
        } catch {
          // No reply: nothing was changed on the server, loading again is safe.
          busy.current = false;
          setNextFailed(true);
          setPhase('feedback');
          return;
        }
        busy.current = false;
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
        setRecent((refs) => [...refs, next.itemRef].slice(-10));
        setSelected(null);
        setText('');
        setHintOpen(false);
        setRuleOpen(false);
        hintUsed.current = false;
        attemptKey.current = null;
        setWhyOpen(false);
        setFeedback(null);
        shownAt.current = Date.now();
        setPhase(needsIntro(next) ? 'theory' : 'answering');
      });
    },
    [needsIntro],
  );

  const goOn = useCallback(() => {
    if (phase !== 'feedback') return;
    if (completed >= sessionLength) setPhase('done');
    else loadNext(recent);
  }, [phase, completed, sessionLength, loadNext, recent]);

  const startAgain = useCallback(() => {
    setCompleted(0);
    setEntries([]);
    loadNext(recent);
  }, [loadNext, recent]);

  // Reads the phase and actions of the latest render, even for a key pressed
  // right after a commit and before effects run — so it is attached once, not
  // re-attached per phase (a re-attached listener lagged a frame behind).
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
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
        if (phase === 'theory') startQuestions();
        else if (phase === 'answering') check();
        else goOn();
        break;
      case 'select':
        setSelected(action.index);
        break;
      case 'dontKnow':
        submit({ type: 'dontKnow' });
        break;
      case 'toggleHint':
        toggleHint();
        break;
      case 'toggleWhy':
        setWhyOpen((open) => !open);
        break;
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (phase === 'done') {
    return (
      <SessionSummary
        summary={summarizeSession(entries)}
        onAgain={startAgain}
        primaryClassName={primaryButton}
        quietClassName={quietButton}
      >
        <WeekRhythmPanel />
      </SessionSummary>
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

      {phase === 'theory' && view.theory ? (
        <section
          aria-labelledby="theory-intro-title"
          className="flex flex-col gap-5 rounded-card border border-line bg-surface-2 p-5 shadow-soft"
          data-theory-intro=""
        >
          <h2 id="theory-intro-title" className="font-content text-xl text-ink">
            {t('theory.introTitle')}
          </h2>
          <ConceptTheory
            theory={view.theory}
            labels={{ formula: t('theory.formula'), examples: t('theory.examples') }}
          />
          <div>
            <button ref={startRef} type="button" className={primaryButton} onClick={startQuestions}>
              {t('theory.start')}
              <KeyHint className="border-transparent bg-transparent text-on-accent">Enter</KeyHint>
            </button>
          </div>
        </section>
      ) : (
        <section aria-labelledby="exercise-prompt" className="flex flex-col gap-5">
          <p className="text-sm text-ink-muted">
            {question.type === 'choice'
              ? t('player.chooseInstruction')
              : t('player.typeInstruction')}
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
                const isWrongPick =
                  feedback !== null && feedback.chosenIndex === index && !isCorrect;
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

          {ruleOpen && view.theory && !answered ? (
            <div
              id="exercise-rule"
              className="rounded-card border border-line bg-surface-2 p-4"
              data-theory-peek=""
            >
              <ConceptTheory
                theory={view.theory}
                labels={{ formula: t('theory.formula'), examples: t('theory.examples') }}
              />
            </div>
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
                <KeyHint className="border-transparent bg-transparent text-on-accent">
                  Enter
                </KeyHint>
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
                  onClick={toggleHint}
                  disabled={phase !== 'answering'}
                >
                  {t('player.hint')}
                  <KeyHint>H</KeyHint>
                </button>
              ) : null}
              {view.theory ? (
                <button
                  type="button"
                  className={quietButton}
                  aria-expanded={ruleOpen}
                  aria-controls="exercise-rule"
                  onClick={() => setRuleOpen((open) => !open)}
                  disabled={phase !== 'answering'}
                  data-rule-toggle=""
                >
                  {t('theory.show')}
                </button>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-feedback-incorrect">
              {t('player.error')}
            </p>
          ) : null}
          {unsent ? (
            <div role="alert" className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-feedback-incorrect">{t('player.sendFailed')}</p>
              <button
                ref={retryRef}
                type="button"
                className={quietButton}
                onClick={() => submit(unsent.answer, unsent.timeMs)}
                disabled={phase !== 'answering'}
              >
                {t('player.retry')}
              </button>
            </div>
          ) : null}
        </section>
      )}

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
      {nextFailed ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-feedback-incorrect">{t('player.nextFailed')}</p>
          <button
            ref={nextRetryRef}
            type="button"
            className={quietButton}
            onClick={() => loadNext(recent)}
            disabled={phase !== 'feedback'}
          >
            {t('player.retry')}
          </button>
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          data-report-issue=""
        >
          {tf('reportIssue')}
        </button>
      </div>
      <FeedbackDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        initialKind="CONTENT_ERROR"
        itemRef={view.itemRef}
      />
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
      {feedback.why ? (
        <p data-why="" className="text-sm text-ink">
          {feedback.why}
        </p>
      ) : null}
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
