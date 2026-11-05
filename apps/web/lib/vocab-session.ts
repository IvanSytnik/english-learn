import 'server-only';
import { prisma } from '@englishlearn/db';
import { getNativeLanguage } from '@englishlearn/db/queries/student-profile';
import { hasItemReviewState } from '@englishlearn/db/queries/vocab-session';
import type { Locale, PartOfSpeechValue } from '@englishlearn/db/schemas';
import {
  buildVocabCard,
  buildVocabIntro,
  buildVocabVariant,
  type CEFRLevel,
  cardSeed,
  glossOf,
  gradeVocabAnswer,
  PAYLOAD_MODE,
  PROOF_MODE,
  recallCue,
  type VocabAnswer,
  type VocabCardView,
  type VocabGradingKey,
  type VocabIntroView,
  type VocabLocale,
  type VocabMode,
} from '@englishlearn/learner-model';
import type { VocabAttemptAnalytics, VocabSessionScope } from '@englishlearn/learner-model/service';
import { decryptVocabRef, encryptVocabRef, type VocabRef } from '@/lib/crypto/vocab-ref';
import { contentLocale, type Review, reviewFor, type Verdict } from '@/lib/exercise/view';
import { learnerService, vocabSessionService } from '@/lib/learner';
import type { Result } from '@/lib/result';
import { getVocabPool, type VocabPool } from '@/lib/vocab-pool';

/**
 * The vocabulary session's server side (B2.6): serve a card, turn a new word
 * into a "Know -> prove" check, grade and record an answer. Stateless — every
 * card is rebuilt from its vocabRef — and nothing that crosses to the client
 * names the item, the lexeme or the answer before the answer is in (Axiom 3);
 * no FSRS number ever does (Axiom 4).
 *
 * Every outcome goes through recordVocabOutcome with the attempt key and the
 * review state the card was built for: the write path decides STALE under the
 * user lock, after the key, so a resend after a lost reply still gets its
 * outcome and two tabs answering one card record it once.
 */

export type VocabSessionError =
  /** A vocabRef that is not this learner's, expired, forged, or used out of turn. */
  | 'INVALID'
  /** The word is no longer published. */
  | 'NOT_FOUND';

export type VocabCardPayload = {
  /** Opaque reference the client echoes back with its answer. */
  vocabRef: string;
  card: VocabCardView;
  /** Part of speech of the word (shown with the English word in mode 1). */
  pos: PartOfSpeechValue;
  /**
   * What `H` reveals: the first-letter mask, in full recall only. Null for a
   * proof (proving knowledge takes no hint) and for every other mode — cued
   * recall shows the mask already. A hinted answer is rated HARD.
   */
  hint: string | null;
  /** A never-answered word in its first mode: "I know it" opens a proof. */
  canProve: boolean;
  /** This card is the proof itself (one cued recall answer). */
  isProof: boolean;
};

export type NextVocabCard =
  | ({ status: 'card'; remainingNew: number } & VocabCardPayload)
  /**
   * A new word's intro card (B6.5): no options, no key, nothing recorded.
   * Its `vocabRef` only turns into the word's first question (`afterIntro`).
   */
  | {
      status: 'intro';
      vocabRef: string;
      word: VocabIntroView;
      /** The word's public slug, for "Add to list…" (B6.7); null if it has none. */
      slug: string | null;
      remainingNew: number;
    }
  /** Nothing due and no new word allowed: the next due moment (Unix ms), if any. */
  | { status: 'done'; nextDueAt: number | null; remainingNew: number };

export type VocabSubmission = {
  vocabRef: string;
  answer:
    | { type: 'choice'; index: number }
    | { type: 'text'; value: string }
    | { type: 'dontKnow' };
  hinted?: boolean;
  timeMs?: number;
  /** One per card shown, reused by every resend of it. */
  attemptKey?: string;
};

export type VocabFeedback = {
  status: 'answered';
  verdict: Verdict;
  /** Choice modes: the right option. */
  correctIndex: number | null;
  /** Choice modes: the learner's pick, when it grades the way it was recorded. */
  chosenIndex: number | null;
  /** The word, revealed now that the answer is in. */
  word: {
    lemma: string;
    ipa: string | null;
    gloss: string;
    /** The English definition. */
    definition: string;
    example: { sentence: string; translation: string | null } | null;
  };
  /** A passed proof: the word is scheduled as known. */
  proven: boolean;
  review: Review;
};

export type VocabSubmitOutcome =
  | VocabFeedback
  /** Another word with the same meaning: nothing recorded, ask again. */
  | { status: 'synonym_retry' }
  /** The word was answered since this card was served: nothing recorded. */
  | { status: 'stale' };

const toVocabLocale = (locale: Locale): VocabLocale => locale;

/** The language a learner reads glosses in: their native language, else the UI's. */
export async function learnerLocale(userId: string, uiLocale: Locale): Promise<VocabLocale> {
  return toVocabLocale(contentLocale(await getNativeLanguage(prisma, userId), uiLocale));
}

const seedOf = (userId: string, ref: VocabRef) =>
  cardSeed({ userId, itemId: ref.itemId, lastReviewAt: ref.lastReviewAt });

/** The card for `ref`, built exactly as it was served: its sealed variant, no new pick. */
function rebuild(pool: VocabPool, userId: string, ref: VocabRef) {
  const target = pool.byItemId.get(ref.itemId);
  if (!target) return null;
  const card = buildVocabVariant(
    { target, pool: pool.lexemes, locale: ref.locale, seed: seedOf(userId, ref) },
    ref.mode,
  );
  return { target, card };
}

/**
 * A fresh card for the word on rung `rung`: one of the rung's variants the
 * word and the learner's level allow, picked by card seed (B6.5).
 */
function serve(
  pool: VocabPool,
  userId: string,
  ref: VocabRef & { mode: VocabMode },
  learnerLevel: CEFRLevel | null,
) {
  const target = pool.byItemId.get(ref.itemId);
  if (!target) return null;
  const card = buildVocabCard({
    target,
    pool: pool.lexemes,
    mode: ref.mode,
    locale: ref.locale,
    seed: seedOf(userId, ref),
    learnerLevel,
  });
  return { target, card };
}

/** The Item behind each option (sealed into the ref); null if one is missing. */
function optionItemIds(pool: VocabPool, lexemeIds: readonly string[]): string[] | null {
  const ids = lexemeIds.map((id) => pool.itemIdByLexemeId.get(id));
  return ids.every((id) => id !== undefined) ? (ids as string[]) : null;
}

const hintFor = (lemma: string, ref: VocabRef): string | null =>
  ref.mode === 'full_recall' && !ref.isProof ? recallCue(lemma) : null;

/** The next word for the learner, as a client-safe card. */
export async function loadNextVocabCard(args: {
  userId: string;
  uiLocale: Locale;
  timeZone: unknown;
  scope?: VocabSessionScope;
  excludeItemIds?: readonly string[];
}): Promise<Result<NextVocabCard, VocabSessionError>> {
  const { userId } = args;
  const [selection, locale, pool] = await Promise.all([
    vocabSessionService.nextVocab({
      userId,
      timeZone: args.timeZone,
      scope: args.scope,
      excludeItemIds: args.excludeItemIds,
    }),
    learnerLocale(userId, args.uiLocale),
    getVocabPool(),
  ]);
  if (!selection.ok) {
    const { nextDueAt, remainingNew } = selection;
    return {
      ok: true,
      value: {
        status: 'done',
        nextDueAt: nextDueAt === null ? null : Number(nextDueAt),
        remainingNew,
      },
    };
  }

  const ref = {
    kind: 'question',
    itemId: selection.itemId,
    mode: selection.mode,
    isProof: false,
    lastReviewAt: selection.lastReviewAt,
    locale,
    correctIndex: null,
    optionItemIds: null,
  } satisfies VocabRef;

  // A word never answered opens on its intro card, not its first question.
  if (selection.reason === 'NEW' && selection.lastReviewAt === null) {
    const target = pool.byItemId.get(ref.itemId);
    if (!target) return { ok: false, error: 'NOT_FOUND' };
    const intro: VocabRef = { ...ref, kind: 'intro' };
    return {
      ok: true,
      value: {
        status: 'intro',
        vocabRef: await encryptVocabRef({ ...intro, userId }),
        word: buildVocabIntro(target, {
          locale,
          learnerLevel: selection.learnerLevel,
          seed: seedOf(userId, intro),
        }),
        slug: pool.slugByItemId.get(ref.itemId) ?? null,
        remainingNew: selection.remainingNew,
      },
    };
  }

  const card = await questionPayload(pool, userId, ref, selection.learnerLevel);
  if (!card) return { ok: false, error: 'NOT_FOUND' };
  return { ok: true, value: { status: 'card', ...card, remainingNew: selection.remainingNew } };
}

/**
 * The client-safe question for `ref` (a rung, not yet a variant), with its
 * sealed reference. Null when the word left the pool — published since the
 * pool was cached, or unpublished since selection read it.
 */
async function questionPayload(
  pool: VocabPool,
  userId: string,
  ref: VocabRef & { mode: VocabMode },
  learnerLevel: CEFRLevel | null,
): Promise<VocabCardPayload | null> {
  const built = serve(pool, userId, ref, learnerLevel);
  if (!built) return null;
  const { view, key } = built.card;
  // The served variant is the view's: the rung's pick, or the cloze fallback.
  const served: VocabRef = {
    ...ref,
    kind: 'question',
    mode: view.mode,
    correctIndex: key.kind === 'choice' ? key.correctIndex : null,
    optionItemIds: key.kind === 'choice' ? optionItemIds(pool, key.optionLexemeIds) : null,
  };
  return {
    vocabRef: await encryptVocabRef({ ...served, userId }),
    card: view,
    pos: built.target.pos,
    hint: hintFor(built.target.lemma, served),
    canProve: ref.lastReviewAt === null && view.mode === 'en_to_l1',
    isProof: false,
  };
}

/**
 * After a new word's intro card (B6.5): the word's first question
 * (`en_to_l1`), without running the selector. Only an intro reference issued
 * to this learner opens it — a question reference, another learner's, an
 * expired or forged one is INVALID, like any bad reference. If the word has
 * been answered since (another tab), the session goes on as usual: the next
 * card is selected.
 */
export async function loadCardAfterIntro(args: {
  userId: string;
  uiLocale: Locale;
  timeZone: unknown;
  scope?: VocabSessionScope;
  excludeItemIds?: readonly string[];
  introRef: string;
}): Promise<Result<NextVocabCard, VocabSessionError>> {
  const { userId, introRef, ...rest } = args;
  const decrypted = await decryptVocabRef(introRef, userId);
  if (!decrypted.ok || decrypted.value.kind !== 'intro') return { ok: false, error: 'INVALID' };
  const intro = decrypted.value;

  const [answered, pool, remainingNew] = await Promise.all([
    hasItemReviewState(prisma, { userId, itemId: intro.itemId }),
    getVocabPool(),
    vocabSessionService.remainingNew({ userId, timeZone: args.timeZone }),
  ]);
  if (answered) return loadNextVocabCard({ userId, ...rest });

  // The first rung (en_to_l1 has no level-dependent variant): no level needed.
  const question = { ...intro, kind: 'question', mode: 'en_to_l1', lastReviewAt: null } as const;
  const card = await questionPayload(pool, userId, question, null);
  if (!card) return { ok: false, error: 'NOT_FOUND' };
  return { ok: true, value: { status: 'card', ...card, remainingNew } };
}

/**
 * "I know this word": swap a new word's first card for one cued recall
 * answer. From the word's intro card (`K`, B6.6) or its first question — a
 * card served for a never-answered word; if the word has been answered since
 * (another tab), the card is stale.
 */
export async function startVocabProof(args: {
  userId: string;
  vocabRef: string;
}): Promise<Result<VocabProofStart, VocabSessionError>> {
  const { userId } = args;
  const decrypted = await decryptVocabRef(args.vocabRef, userId);
  if (!decrypted.ok) return { ok: false, error: 'INVALID' };
  const ref = decrypted.value;
  // A proof is offered once, for a word never answered: not from a proof,
  // not from a later rung.
  if (ref.isProof || ref.lastReviewAt !== null || ref.mode !== 'en_to_l1') {
    return { ok: false, error: 'INVALID' };
  }
  const pool = await getVocabPool();
  return proofCard(pool, userId, { ...ref, kind: 'question' });
}

/**
 * "I know" on a word page (B6.6): the same proof, for the word a public slug
 * names (B6-SPEC §1). An unknown, ambiguous or unpublished slug is NOT_FOUND;
 * a word already answered is stale — it is being learned, nothing to prove.
 */
export async function startWordProof(args: {
  userId: string;
  uiLocale: Locale;
  slug: string;
}): Promise<Result<VocabProofStart, VocabSessionError>> {
  const { userId } = args;
  const [pool, locale] = await Promise.all([getVocabPool(), learnerLocale(userId, args.uiLocale)]);
  const word = pool.bySlug.get(args.slug);
  if (!word) return { ok: false, error: 'NOT_FOUND' };
  return proofCard(pool, userId, {
    kind: 'question',
    itemId: word.itemId,
    mode: 'en_to_l1',
    isProof: false,
    lastReviewAt: null,
    locale,
    correctIndex: null,
    optionItemIds: null,
  });
}

export type VocabProofStart = VocabCardPayload | { status: 'stale' };

/** The proof card for a never-answered word's first question `ref`. */
async function proofCard(
  pool: VocabPool,
  userId: string,
  ref: VocabRef,
): Promise<Result<VocabProofStart, VocabSessionError>> {
  if (await hasItemReviewState(prisma, { userId, itemId: ref.itemId })) {
    return { ok: true, value: { status: 'stale' } };
  }
  const proof: VocabRef = {
    ...ref,
    mode: PROOF_MODE,
    isProof: true,
    correctIndex: null,
    optionItemIds: null,
  };
  const built = rebuild(pool, userId, proof);
  if (!built) return { ok: false, error: 'NOT_FOUND' };
  return {
    ok: true,
    value: {
      vocabRef: await encryptVocabRef({ ...proof, userId }),
      card: built.card.view,
      pos: built.target.pos,
      hint: null,
      canProve: false,
      isProof: true,
    },
  };
}

const toVocabAnswer = (answer: VocabSubmission['answer']): VocabAnswer =>
  answer.type === 'choice'
    ? { kind: 'choice', index: answer.index }
    : answer.type === 'text'
      ? { kind: 'text', text: answer.value }
      : { kind: 'dont_know' };

/**
 * What the payload keeps of this answer (B6.1): the card actually shown (the
 * served mode, cloze fallback included), its language, and — for analysis
 * of confusions — the distractor a wrong pick chose (from the ids sealed in
 * the ref; a ref issued before B6.1 has none) or the typed text.
 */
function analyticsFor(
  ref: VocabRef,
  answer: VocabSubmission['answer'],
  grade: 'CORRECT' | 'INCORRECT' | 'DONT_KNOW',
): VocabAttemptAnalytics {
  const chosen =
    answer.type === 'choice' && grade === 'INCORRECT'
      ? ref.optionItemIds?.[answer.index]
      : undefined;
  return {
    variant: ref.mode,
    locale: ref.locale,
    ...(chosen !== undefined && chosen !== ref.itemId ? { chosenItemId: chosen } : {}),
    ...(answer.type === 'text' && grade !== 'DONT_KNOW' ? { answerText: answer.value } : {}),
  };
}

/**
 * Grade one answer against the card that was served and record it. A
 * synonym of the asked word records nothing and asks again; a card whose
 * word was answered since records nothing and is reported stale.
 */
export async function submitVocabAttempt(
  args: { userId: string } & VocabSubmission,
): Promise<Result<VocabSubmitOutcome, VocabSessionError>> {
  const { userId } = args;
  const decrypted = await decryptVocabRef(args.vocabRef, userId);
  if (!decrypted.ok) return { ok: false, error: 'INVALID' };
  const ref = decrypted.value;
  // An intro card has no answer: its reference is refused like a forged one,
  // before anything is graded or written (B6.5).
  if (ref.kind !== 'question') return { ok: false, error: 'INVALID' };

  const pool = await getVocabPool();
  const target = pool.byItemId.get(ref.itemId);
  if (!target) return { ok: false, error: 'NOT_FOUND' };

  // Choice: the index sealed when the card was served. Recall: the accepted
  // spellings and synonyms, rebuilt for the served mode and language.
  let key: VocabGradingKey | null = null;
  if (ref.correctIndex !== null) {
    if (ref.mode === 'cued_recall' || ref.mode === 'full_recall') {
      return { ok: false, error: 'INVALID' };
    }
    key = { kind: 'choice', mode: ref.mode, correctIndex: ref.correctIndex };
  } else {
    const rebuilt = rebuild(pool, userId, ref)?.card.key;
    if (rebuilt?.kind === 'text') key = rebuilt;
  }
  if (key === null) return { ok: false, error: 'INVALID' };

  const grade = gradeVocabAnswer(key, toVocabAnswer(args.answer));
  if (grade === 'INVALID') return { ok: false, error: 'INVALID' };
  if (grade === 'SYNONYM_COLLISION') return { ok: true, value: { status: 'synonym_retry' } };

  const base = {
    userId,
    itemId: ref.itemId,
    mode: PAYLOAD_MODE[ref.mode],
    // Only a correct answer proves; a failed proof is an ordinary attempt.
    proof: ref.isProof && grade === 'CORRECT',
    hinted: args.hinted,
    timeMs: args.timeMs,
    idempotencyKey: args.attemptKey,
    expectedLastReviewAt: ref.lastReviewAt,
    analytics: analyticsFor(ref, args.answer, grade),
  };
  const recorded = await learnerService.recordVocabOutcome(
    grade === 'DONT_KNOW' ? { ...base, dontKnow: true } : { ...base, correct: grade === 'CORRECT' },
  );
  if (!recorded.ok) {
    if (recorded.error === 'STALE') return { ok: true, value: { status: 'stale' } };
    // A key reused for another word is a client bug or tampering.
    return {
      ok: false,
      error: recorded.error === 'IDEMPOTENCY_CONFLICT' ? 'INVALID' : 'NOT_FOUND',
    };
  }

  // A resend of an answer already recorded reports what was recorded.
  const graded: Verdict =
    grade === 'DONT_KNOW' ? 'dontKnow' : grade === 'CORRECT' ? 'correct' : 'incorrect';
  const original = recorded.duplicate ? recorded.original : null;
  const verdict: Verdict = original
    ? original.dontKnow
      ? 'dontKnow'
      : original.correct
        ? 'correct'
        : 'incorrect'
    : graded;

  const example = target.examples[0];
  return {
    ok: true,
    value: {
      status: 'answered',
      verdict,
      correctIndex: ref.correctIndex,
      chosenIndex: args.answer.type === 'choice' && verdict === graded ? args.answer.index : null,
      word: {
        lemma: target.lemma,
        ipa: target.ipa,
        gloss: glossOf(target, ref.locale),
        definition: target.definitions.en,
        example: example
          ? {
              sentence: example.sentence,
              translation: ref.locale === 'en' ? null : (example.translation[ref.locale] ?? null),
            }
          : null,
      },
      proven: ref.isProof && recorded.rating === 'EASY',
      review: reviewFor(recorded.scheduledDays),
    },
  };
}
