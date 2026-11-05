'use client';

import type { VocabIntroView } from '@englishlearn/learner-model';
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
import { callServerAction } from '@/lib/action-skew';
import { focusKind } from '@/lib/exercise/shortcuts';
import type { Verdict } from '@/lib/exercise/view';
import { RECENT_EXCLUDE } from '@/lib/recent-refs';
import type { ClientVocabScope } from '@/lib/vocab-scope';
import type { VocabCardPayload, VocabFeedback, VocabSubmission } from '@/lib/vocab-session';
import {
  isEditableTarget,
  resolveIntroShortcut,
  resolveVocabShortcut,
  type VocabPlayerPhase,
} from '@/lib/vocab-shortcuts';
import { summarizeVocabSession, type VocabSessionEntry } from '@/lib/vocab-summary';
import { browserTimeZone } from '../../_components/browser-time-zone';
import { FeedbackDialog } from '../../_components/feedback-dialog';
import {
  nextVocabCardAction,
  startVocabProofAction,
  startWordProofAction,
  submitVocabAttemptAction,
} from '../../actions/vocab';
import { AddToListMenu } from '../_components/add-to-list-menu';
import { IpaTag, VocabCardAnswer, VocabCardPrompt, VocabIntroCard } from './vocab-renderers';
import { VocabSessionSummary } from './vocab-session-summary';

/** Cards per session (client-enforced, like the exercise player's length). */
export const VOCAB_SESSION_LENGTH = 15;

type Answer = VocabSubmission['answer'];
type Notice = 'synonym' | 'stale' | null;

/**
 * Where "I know" was asked (B6.6): a never-answered word's question card, its
 * intro card (`K`), or a word page (`proveSlug`, before the session's first
 * card). A lost request goes back there, and Retry asks again.
 */
type ProofSource =
  | { from: 'answering' | 'intro'; vocabRef: string }
  | { from: 'start'; slug: string };

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
export function VocabPlayer({
  scope,
  proveSlug,
}: {
  scope?: ClientVocabScope;
  /** "I know" on a word page (B6.6): open the session on that word's proof. */
  proveSlug?: string;
}) {
  const t = useTranslations('student.words.player');
  const tl = useTranslations('learning');
  const tf = useTranslations('feedback');
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [card, setCard] = useState<VocabCardPayload | null>(null);
  // A new word's intro card (B6.5), shown instead of a card until Continue / K.
  const [intro, setIntro] = useState<{
    vocabRef: string;
    word: VocabIntroView;
    slug: string | null;
  } | null>(null);
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
  const [proofFailed, setProofFailed] = useState<ProofSource | null>(null);
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
  const introContinueRef = useRef<HTMLButtonElement>(null);
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
  const anyRetry = unsent !== null || nextFailed || proofFailed !== null;
  useEffect(() => {
    if (anyRetry) {
      retryRef.current?.focus();
      return;
    }
    if (phase === 'intro') introContinueRef.current?.focus();
    if (phase === 'answering') (isChoice ? promptRef : inputRef).current?.focus();
    if (phase === 'feedback') continueRef.current?.focus();
  }, [phase, isChoice, anyRetry, card]);

  // With `afterIntro`: the first question of the word that intro card showed.
  const loadNext = useCallback(
    (recentRefs: string[], afterIntro?: string) => {
      if (busy.current) return;
      busy.current = true;
      setPhase('loading');
      setError(false);
      setNextFailed(false);
      setProofFailed(null);
      startTransition(async () => {
        let res: Awaited<ReturnType<typeof nextVocabCardAction>>;
        try {
          // A page from before a deploy reloads once instead (V2-15).
          res = await callServerAction(() =>
            nextVocabCardAction({
              timeZone: browserTimeZone(),
              scope,
              recentVocabRefs: recentRefs,
              ...(afterIntro === undefined ? {} : { afterIntro }),
            }),
          );
        } catch {
          // No reply: nothing changed on the server, loading again is safe.
          busy.current = false;
          setNextFailed(true);
          if (afterIntro !== undefined) setPhase('intro');
          return;
        }
        busy.current = false;
        if (!res.ok) {
          // Refused (e.g. briefly unavailable): Retry asks again.
          setNextFailed(true);
          if (afterIntro !== undefined) setPhase('intro');
          return;
        }
        if (res.value.status === 'done') {
          setIntro(null);
          setNothingDue(true);
          setPhase('done');
          return;
        }
        if (res.value.status === 'intro') {
          // Not a card: not in the recent list (its question will be).
          const { vocabRef, word, slug } = res.value;
          setCard(null);
          setFeedback(null);
          setUnsent(null);
          setError(false);
          setIntro({ vocabRef, word, slug });
          setPhase('intro');
          return;
        }
        const next = res.value;
        setIntro(null);
        setRecent((refs) => [...refs, next.vocabRef].slice(-RECENT_EXCLUDE));
        show(next);
      });
    },
    [scope, show],
  );

  const submit = useCallback(
    (answer: Answer, resendTimeMs?: number) => {
      if (!card || phase !== 'answering' || busy.current) return;
      busy.current = true;
      setPhase('submitting');
      setError(false);
      setUnsent(null);
      setProofFailed(null);
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
          res = await callServerAction(() => submitVocabAttemptAction(request));
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

  // "I know": the B2.5 proof — one cued recall answer — for a word never answered.
  const requestProof = useCallback(
    (source: ProofSource) => {
      if (busy.current) return;
      busy.current = true;
      // Back where it was asked if the request is lost.
      const back = source.from === 'start' ? 'loading' : source.from;
      setPhase(source.from === 'start' ? 'loading' : 'submitting');
      setError(false);
      setNextFailed(false);
      setProofFailed(null);
      startTransition(async () => {
        let res: Awaited<ReturnType<typeof startVocabProofAction>>;
        try {
          res = await callServerAction(() =>
            source.from === 'start'
              ? startWordProofAction({ slug: source.slug })
              : startVocabProofAction({ vocabRef: source.vocabRef }),
          );
        } catch {
          // No reply: nothing is written by starting a proof, asking again is safe.
          busy.current = false;
          setProofFailed(source);
          setPhase(back);
          return;
        }
        busy.current = false;
        if (source.from === 'start' && (!res.ok || 'status' in res.value)) {
          // The word page's word cannot be proved now (being learned since,
          // unpublished): the session simply starts.
          loadNext([]);
          return;
        }
        if (!res.ok) {
          setError(true);
          setPhase(back);
          return;
        }
        if ('status' in res.value) {
          setNotice('stale');
          loadNext(recent);
          return;
        }
        const proof = res.value;
        setNotice(null);
        setIntro(null);
        // A question card's word is in the recent list already.
        if (source.from !== 'answering') {
          setRecent((refs) => [...refs, proof.vocabRef].slice(-RECENT_EXCLUDE));
        }
        show(proof);
      });
    },
    [loadNext, recent, show],
  );

  const startProof = useCallback(() => {
    if (!card || !offersProof || phase !== 'answering') return;
    requestProof({ from: 'answering', vocabRef: card.vocabRef });
  }, [card, offersProof, phase, requestProof]);

  // Continue on an intro card: the word's first question.
  const continueIntro = useCallback(() => {
    if (phase !== 'intro' || !intro) return;
    loadNext(recent, intro.vocabRef);
  }, [phase, intro, loadNext, recent]);

  // "I know" on an intro card (`K`, B6.6): the proof instead of the first question.
  const knowIntro = useCallback(() => {
    if (phase !== 'intro' || !intro) return;
    requestProof({ from: 'intro', vocabRef: intro.vocabRef });
  }, [phase, intro, requestProof]);

  // The first card, in the browser's time zone — or the word page's proof.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (proveSlug === undefined) loadNext([]);
    else requestProof({ from: 'start', slug: proveSlug });
  }, [loadNext, requestProof, proveSlug]);

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
    if (phase === 'intro') {
      const introAction = resolveIntroShortcut(event, {
        inEditable: isEditableTarget(event.target),
        onActivatable: focusKind(event.target).onActivatable,
      });
      if (!introAction) return;
      event.preventDefault();
      if (introAction.type === 'pause') router.push('/words');
      else if (introAction.type === 'know') knowIntro();
      else continueIntro();
      return;
    }
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
      ? { text: t('proofFailed'), onClick: () => requestProof(proofFailed) }
      : nextFailed
        ? { text: t('nextFailed'), onClick: () => loadNext(recent, intro?.vocabRef) }
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
            <VocabCardPrompt view={view} card={card} feedback={feedback} />
          </div>

          <VocabCardAnswer
            view={view}
            feedback={feedback}
            answered={answered}
            disabled={phase !== 'answering'}
            selected={selected}
            onSelect={setSelected}
            text={text}
            onText={setText}
            inputRef={inputRef}
          />

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
      ) : intro ? (
        <VocabIntroCard
          word={intro.word}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <button
                ref={introContinueRef}
                type="button"
                className={primaryButton}
                onClick={continueIntro}
                disabled={phase !== 'intro'}
              >
                {tl('player.continue')}
                <KeyHint className="border-transparent bg-transparent text-on-accent">
                  Enter
                </KeyHint>
              </button>
              <button
                type="button"
                className={quietButton}
                onClick={knowIntro}
                disabled={phase !== 'intro'}
              >
                {t('know')}
                <KeyHint>K</KeyHint>
              </button>
              {intro.slug !== null ? (
                <AddToListMenu slug={intro.slug} headword={intro.word.word} />
              ) : null}
            </div>
          }
        />
      ) : nextFailed || proofFailed ? null : (
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
        {word.ipa ? <IpaTag ipa={word.ipa} className="text-sm text-ink-muted" /> : null}
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
