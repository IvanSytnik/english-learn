'use client';

import { PRACTICE_GAP } from '@englishlearn/db/schemas';
import { cn, KeyHint, SegmentedProgress } from '@englishlearn/ui';
import { Check, CircleHelp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from '@/i18n/navigation';
import { focusKind } from '@/lib/exercise/shortcuts';
import type { Verdict } from '@/lib/exercise/view';
import type { VocabCardPayload, VocabFeedback, VocabSubmission } from '@/lib/vocab-session';
import { resolveVocabShortcut, type VocabPlayerPhase } from '@/lib/vocab-shortcuts';
import { summarizeVocabSession, type VocabSessionEntry } from '@/lib/vocab-summary';
import { browserTimeZone } from '../../_components/browser-time-zone';
import { FeedbackDialog } from '../../_components/feedback-dialog';
import {
  nextVocabCardAction,
  startVocabProofAction,
  submitVocabAttemptAction,
} from '../../actions/vocab';
import { VocabSessionSummary } from './vocab-session-summary';

/** Cards per session (client-enforced, like the exercise player's length). */
export const VOCAB_SESSION_LENGTH = 15;
/** Cards just shown that selection is asked to skip. */
const RECENT_REFS = 5;

type Answer = VocabSubmission['answer'];
type Notice = 'synonym' | 'stale' | null;

const primaryButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control bg-accent px-5 text-sm font-medium text-on-accent transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';
const quietButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-control border border-line px-4 text-sm font-medium text-ink transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';

/**
 * The vocabulary session: one card at a time in its ladder mode, "I know this
 * word" on a new word (one cued recall answer proves it), inline feedback,
 * a summary after VOCAB_SESSION_LENGTH cards or when nothing is left.
 *
 * Grading and recording happen on the server; the card carries no answer.
 * Every action call is guarded: a lost reply offers Retry (focused), and a
 * resent answer keeps its attempt key, so the server records it once. One
 * request at a time (`busy`, set before the call). Keys: one window listener,
 * attached once (`useEffectEvent`), silent while typing in the answer field.
 */
export function VocabPlayer({ conceptId }: { conceptId?: string }) {
  const t = useTranslations('student.words.player');
  const tl = useTranslations('learning');
  const tf = useTranslations('feedback');
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [card, setCard] = useState<VocabCardPayload | null>(null);
  const [phase, setPhase] = useState<VocabPlayerPhase>('loading');
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [hintOpen, setHintOpen] = useState(false);
  const [feedback, setFeedback] = useState<VocabFeedback | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [completed, setCompleted] = useState(0);
  const [entries, setEntries] = useState<VocabSessionEntry[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [nothingDue, setNothingDue] = useState(false);
  // A refused request (not a lost one): said so, nothing to resend.
  const [error, setError] = useState(false);
  // An answer whose reply never came back: offered for resending as is.
  const [unsent, setUnsent] = useState<{ answer: Answer; timeMs: number } | null>(null);
  // The next card / the proof card never came back: Retry loads it again.
  const [nextFailed, setNextFailed] = useState(false);
  const [proofFailed, setProofFailed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const busy = useRef(false);
  const shownAt = useRef(Date.now());
  // The hint was opened on this card (even if closed again): sent as
  // `hinted`, set synchronously so an answer in the same tick carries it.
  const hintUsed = useRef(false);
  // One per card shown — a new one for the next card and for a proof card —
  // kept by every resend and by a synonym retry, so the server records the
  // card's answer once.
  const attemptKey = useRef<string>('');
  const promptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);

  const view = card?.card ?? null;
  const isChoice = view !== null && 'options' in view;
  const optionCount = isChoice ? view.options.length : 0;
  // Neither "I know" nor the hint inside a proof, whatever the payload says.
  const offersProof = card?.canProve === true && !card.isProof;
  const offersHint = card !== null && card.hint !== null && !card.isProof;
  const canProve = offersProof && phase === 'answering';

  const show = useCallback((next: VocabCardPayload) => {
    setCard(next);
    setSelected(null);
    setText('');
    setHintOpen(false);
    hintUsed.current = false;
    attemptKey.current = crypto.randomUUID();
    setFeedback(null);
    setUnsent(null);
    setError(false);
    shownAt.current = Date.now();
    setPhase('answering');
  }, []);

  // Focus goes where the next action is: Retry after a lost request, the
  // answer field or the prompt for a card, Continue once feedback is in.
  const anyRetry = unsent !== null || nextFailed || proofFailed;
  useEffect(() => {
    if (anyRetry) {
      retryRef.current?.focus();
      return;
    }
    if (phase === 'answering') (isChoice ? promptRef : inputRef).current?.focus();
    if (phase === 'feedback') continueRef.current?.focus();
  }, [phase, isChoice, anyRetry, card]);

  const loadNext = useCallback(
    (recentRefs: string[]) => {
      if (busy.current) return;
      busy.current = true;
      setPhase('loading');
      setError(false);
      setNextFailed(false);
      startTransition(async () => {
        let res: Awaited<ReturnType<typeof nextVocabCardAction>>;
        try {
          res = await nextVocabCardAction({
            timeZone: browserTimeZone(),
            conceptId,
            recentVocabRefs: recentRefs,
          });
        } catch {
          // No reply: nothing changed on the server, loading again is safe.
          busy.current = false;
          setNextFailed(true);
          return;
        }
        busy.current = false;
        if (!res.ok) {
          // Refused (e.g. briefly unavailable): Retry asks again.
          setNextFailed(true);
          return;
        }
        if (res.value.status === 'done') {
          setNothingDue(true);
          setPhase('done');
          return;
        }
        const next = res.value;
        setRecent((refs) => [...refs, next.vocabRef].slice(-RECENT_REFS));
        show(next);
      });
    },
    [conceptId, show],
  );

  // The first card, in the browser's time zone.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    loadNext([]);
  }, [loadNext]);

  const submit = useCallback(
    (answer: Answer, resendTimeMs?: number) => {
      if (!card || phase !== 'answering' || busy.current) return;
      busy.current = true;
      setPhase('submitting');
      setError(false);
      setUnsent(null);
      setProofFailed(false);
      // A resend keeps the time of the first send: the wait is not thinking.
      const timeMs = resendTimeMs ?? Math.max(1, Date.now() - shownAt.current);
      const request = {
        vocabRef: card.vocabRef,
        answer,
        timeMs,
        hinted: hintUsed.current,
        attemptKey: attemptKey.current,
      };
      startTransition(async () => {
        let res: Awaited<ReturnType<typeof submitVocabAttemptAction>>;
        try {
          res = await submitVocabAttemptAction(request);
        } catch {
          // No reply: recorded or not, resending with the same key is safe.
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
        const outcome = res.value;
        if (outcome.status === 'synonym_retry') {
          // Nothing recorded: same card, same key, a fresh try.
          setNotice('synonym');
          setText('');
          setPhase('answering');
          return;
        }
        if (outcome.status === 'stale') {
          // Answered elsewhere since this card was shown: nothing recorded.
          setNotice('stale');
          loadNext(recent);
          return;
        }
        setNotice(null);
        setFeedback(outcome);
        setCompleted((n) => n + 1);
        setEntries((list) => [...list, { verdict: outcome.verdict, proven: outcome.proven }]);
        setPhase('feedback');
      });
    },
    [card, phase, loadNext, recent],
  );

  const check = useCallback(() => {
    if (!view) return;
    if (isChoice) {
      if (selected !== null) submit({ type: 'choice', index: selected });
    } else if (text.trim().length > 0) {
      submit({ type: 'text', value: text });
    }
  }, [view, isChoice, selected, text, submit]);

  const startProof = useCallback(() => {
    if (!card || !offersProof || phase !== 'answering' || busy.current) return;
    busy.current = true;
    setPhase('submitting');
    setError(false);
    setProofFailed(false);
    const vocabRef = card.vocabRef;
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof startVocabProofAction>>;
      try {
        res = await startVocabProofAction({ vocabRef });
      } catch {
        // No reply: nothing is written by starting a proof, asking again is safe.
        busy.current = false;
        setProofFailed(true);
        setPhase('answering');
        return;
      }
      busy.current = false;
      if (!res.ok) {
        setError(true);
        setPhase('answering');
        return;
      }
      if ('status' in res.value) {
        setNotice('stale');
        loadNext(recent);
        return;
      }
      setNotice(null);
      show(res.value);
    });
  }, [card, offersProof, phase, loadNext, recent, show]);

  const toggleHint = useCallback(() => {
    if (phase !== 'answering' || !offersHint) return;
    hintUsed.current = true;
    setHintOpen((open) => !open);
  }, [phase, offersHint]);

  const goOn = useCallback(() => {
    if (phase !== 'feedback') return;
    setNotice(null);
    if (completed >= VOCAB_SESSION_LENGTH) setPhase('done');
    else loadNext(recent);
  }, [phase, completed, loadNext, recent]);

  const startAgain = useCallback(() => {
    setCompleted(0);
    setEntries([]);
    setNothingDue(false);
    setFeedback(null);
    loadNext(recent);
  }, [loadNext, recent]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const action = resolveVocabShortcut(event, {
      phase,
      ...focusKind(event.target),
      optionCount,
      canProve,
      hasHint: offersHint,
    });
    if (!action) return;
    event.preventDefault();
    switch (action.type) {
      case 'pause':
        router.push('/words');
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
      case 'know':
        startProof();
        break;
      case 'toggleHint':
        toggleHint();
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
      <VocabSessionSummary
        summary={summarizeVocabSession(entries)}
        nothingDue={nothingDue}
        onAgain={startAgain}
        primaryClassName={primaryButton}
        quietClassName={quietButton}
      />
    );
  }

  const answered = feedback !== null;
  const retry = unsent
    ? { text: tl('player.sendFailed'), onClick: () => submit(unsent.answer, unsent.timeMs) }
    : proofFailed
      ? { text: t('proofFailed'), onClick: startProof }
      : nextFailed
        ? { text: t('nextFailed'), onClick: () => loadNext(recent) }
        : null;

  return (
    <main className="mx-auto flex w-full max-w-[62ch] flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-3">
        <SegmentedProgress
          total={VOCAB_SESSION_LENGTH}
          completed={completed}
          label={tl('session.progress')}
          valueText={tl('session.progressValue', { done: completed, total: VOCAB_SESSION_LENGTH })}
        />
        <div className="flex items-center justify-between gap-4">
          {card?.isProof ? (
            <span
              className="rounded-control border border-accent px-2 py-0.5 text-xs font-medium text-accent"
              data-proof=""
            >
              {t('proofBadge')}
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => router.push('/words')}
            className="inline-flex shrink-0 items-center gap-2 text-sm text-ink-muted hover:text-ink"
          >
            {tl('player.pause')}
            <KeyHint>Esc</KeyHint>
          </button>
        </div>
      </header>

      {view && card ? (
        <section aria-labelledby="vocab-prompt" className="flex flex-col gap-5">
          <p className="text-sm text-ink-muted" data-mode={view.mode}>
            {card.isProof ? t('proofInstruction') : t(`instruction.${view.mode}`)}
          </p>
          <div
            id="vocab-prompt"
            ref={promptRef}
            tabIndex={-1}
            className="flex flex-col gap-1 outline-none"
          >
            {view.mode === 'en_to_l1' ? (
              <>
                <p lang="en" className="font-content text-[2rem] leading-tight text-ink">
                  {view.word}
                </p>
                <p className="text-sm text-ink-muted">
                  <span>{t('pos', { pos: card.pos })}</span>
                  {view.ipa ? (
                    <span lang="en" className="ml-2 font-mono">
                      {view.ipa}
                    </span>
                  ) : null}
                </p>
              </>
            ) : view.mode === 'cloze' ? (
              <p lang="en" className="font-content text-[1.5rem] leading-snug text-ink">
                <ClozeSentence
                  sentence={view.sentence}
                  fill={
                    feedback?.correctIndex != null
                      ? (view.options[feedback.correctIndex] ?? null)
                      : null
                  }
                />
              </p>
            ) : (
              <p className="font-content text-[1.5rem] leading-snug text-ink">{view.gloss}</p>
            )}
            {view.mode === 'cued_recall' ? (
              <p lang="en" className="font-mono text-lg tracking-widest text-ink-muted" data-cue="">
                {view.cue}
              </p>
            ) : null}
          </div>

          {isChoice ? (
            <ul className="flex flex-col gap-2">
              {view.options.map((option, index) => {
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
                      <span
                        lang={view.mode === 'en_to_l1' ? undefined : 'en'}
                        className="flex-1 font-content text-lg text-ink"
                      >
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
          ) : !answered ? (
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={phase !== 'answering'}
              aria-label={t('answerLabel')}
              lang="en"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-12 rounded-control border border-line bg-surface px-4 font-content text-xl text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          ) : null}

          {hintOpen && offersHint && !answered ? (
            <p lang="en" className="font-mono text-lg tracking-widest text-ink" data-hint="">
              {card.hint}
            </p>
          ) : null}

          {notice ? (
            <p role="status" className="text-sm text-ink" data-notice={notice}>
              {t(notice === 'synonym' ? 'synonym' : 'stale')}
            </p>
          ) : null}

          {!answered ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={primaryButton}
                onClick={check}
                disabled={
                  phase !== 'answering' || (isChoice ? selected === null : text.trim() === '')
                }
              >
                {tl('player.check')}
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
                {tl('player.dontKnow')}
                <KeyHint>0</KeyHint>
              </button>
              {offersProof ? (
                <button
                  type="button"
                  className={quietButton}
                  onClick={startProof}
                  disabled={phase !== 'answering'}
                >
                  {t('know')}
                  <KeyHint>K</KeyHint>
                </button>
              ) : null}
              {offersHint ? (
                <button
                  type="button"
                  className={quietButton}
                  aria-expanded={hintOpen}
                  onClick={toggleHint}
                  disabled={phase !== 'answering'}
                >
                  {tl('player.hint')}
                  <KeyHint>H</KeyHint>
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : nextFailed ? null : (
        <p className="text-sm text-ink-muted" aria-busy="true">
          {t('loading')}
        </p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-feedback-incorrect">
          {tl('player.error')}
        </p>
      ) : null}
      {retry ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-feedback-incorrect">{retry.text}</p>
          <button ref={retryRef} type="button" className={quietButton} onClick={retry.onClick}>
            {tl('player.retry')}
          </button>
        </div>
      ) : null}

      <div aria-live="polite" role="status">
        {feedback ? (
          <WordFeedback
            feedback={feedback}
            onContinue={goOn}
            continueRef={continueRef}
            busy={phase === 'loading'}
          />
        ) : null}
      </div>

      {card ? (
        <>
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
            vocabRef={card.vocabRef}
          />
        </>
      ) : null}
    </main>
  );
}

/** The gap stays empty until the answer is in, then shows the right word. */
function ClozeSentence({ sentence, fill }: { sentence: string; fill: string | null }) {
  const [before, after] = sentence.split(PRACTICE_GAP);
  if (after === undefined) return <>{sentence}</>;
  return (
    <>
      {before}
      <span
        className={cn(
          'mx-1 inline-block min-w-[4ch] border-b-2 px-1 text-center',
          fill ? 'border-feedback-correct' : 'border-ink',
        )}
      >
        {fill ?? '\u00a0'}
      </span>
      {after}
    </>
  );
}

const VERDICT_ICON = { correct: Check, incorrect: X, dontKnow: CircleHelp } as const;
const VERDICT_TONE: Record<Verdict, string> = {
  correct: 'text-feedback-correct',
  incorrect: 'text-feedback-incorrect',
  dontKnow: 'text-ink-muted',
};

function WordFeedback({
  feedback,
  onContinue,
  continueRef,
  busy,
}: {
  feedback: VocabFeedback;
  onContinue: () => void;
  continueRef: RefObject<HTMLButtonElement | null>;
  busy: boolean;
}) {
  const t = useTranslations('student.words.player');
  const tl = useTranslations('learning');
  const { verdict, word, review } = feedback;
  const Icon = VERDICT_ICON[verdict];

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface-2 p-4 shadow-soft">
      <p
        data-verdict={verdict}
        className={cn('flex items-center gap-2 font-medium', VERDICT_TONE[verdict])}
      >
        <Icon aria-hidden="true" className="size-5" />
        {tl(`player.verdict.${verdict}`)}
      </p>
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span lang="en" className="font-content text-2xl text-ink" data-lemma="">
          {word.lemma}
        </span>
        {word.ipa ? (
          <span lang="en" className="font-mono text-sm text-ink-muted">
            {word.ipa}
          </span>
        ) : null}
      </p>
      <p className="text-ink">{word.gloss}</p>
      {word.definition !== word.gloss ? (
        <p lang="en" className="text-sm text-ink-muted" data-definition="">
          {word.definition}
        </p>
      ) : null}
      {word.example ? (
        <div className="flex flex-col gap-1 border-l-2 border-line pl-3">
          <p lang="en" className="font-content text-lg text-ink">
            {word.example.sentence}
          </p>
          {word.example.translation ? (
            <p className="text-sm text-ink-muted" data-example-translation="">
              {word.example.translation}
            </p>
          ) : null}
        </div>
      ) : null}
      {feedback.proven ? (
        <p className="flex items-center gap-2 text-sm font-medium text-accent" data-proven="">
          <Check aria-hidden="true" className="size-4" />
          {t('proven')}
        </p>
      ) : null}
      <p data-review={review.kind} className="text-sm text-ink-muted">
        {review.kind === 'backSoon'
          ? tl('feedback.backSoon')
          : tl('feedback.backInDays', { days: review.days })}
      </p>
      <div>
        <button
          ref={continueRef}
          type="button"
          className={primaryButton}
          onClick={onContinue}
          disabled={busy}
        >
          {tl('player.continue')}
          <KeyHint className="border-transparent bg-transparent text-on-accent">Enter</KeyHint>
        </button>
      </div>
    </div>
  );
}
