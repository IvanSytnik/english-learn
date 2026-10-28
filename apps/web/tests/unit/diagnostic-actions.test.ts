import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Diagnostic actions + orchestrator over an in-memory stand-in for the
 * attempt queries (same semantics: ownership, IN_PROGRESS only, unique
 * position and item, a single winning completion). The ladder is the real
 * one from learner-model. The database guarantees themselves are covered by
 * packages/db's diagnostic-attempt.db.test.ts.
 */

type Level = 'A2' | 'B1' | 'B2' | 'C1';
type Axis = 'GRAMMAR' | 'VOCAB';
type Answer = {
  position: number;
  itemId: string;
  axis: Axis;
  itemLevel: Level;
  correct: boolean;
  dontKnow: boolean;
  userAnswer: string;
};
type Attempt = {
  id: string;
  userId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  answers: Answer[];
  assessedLevel?: string;
};

const LEVELS: Level[] = ['A2', 'B1', 'B2', 'C1'];
/** 2 axes × 4 levels × 8 questions; the key is always the item's `key`. */
const BANK = (['GRAMMAR', 'VOCAB'] as const).flatMap((kind) =>
  LEVELS.flatMap((cefrLevel) =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `q-${kind}-${cefrLevel}-${i}`,
      kind,
      cefrLevel,
      stem: `${kind} ${cefrLevel} ${i} ___.`,
      choices: ['w', 'x', 'y', 'z'],
      key: i % 4,
      explanation: 'SECRET-EXPLANATION',
    })),
  ),
);

const store = vi.hoisted(() => ({
  attempts: [] as Attempt[],
  bank: [] as {
    id: string;
    kind: 'GRAMMAR' | 'VOCAB';
    cefrLevel: string;
    stem: string;
    choices: string[];
    key: number;
  }[],
  nextId: 0,
  /** Give every answered question a skill tag (the real bank has none yet). */
  tagged: false,
  context: {
    concepts: [] as { id: string; cefrLevel: string }[],
    masteries: [] as {
      conceptId: string;
      pKnown: number;
      observationCount: number;
      lastUpdatedAt: number;
      pForgetLambda: number;
    }[],
    prereqEdges: [] as { from: string; to: string; kind: 'PREREQUISITE' }[],
  },
  lastFacts: null as null | { answers: { skillTag: unknown }[] },
  /** StudentProfile.nativeLanguage per user; absent = no profile. */
  languages: new Map<string, string | null>(),
  /** Explanations in the bank also have a Russian translation. */
  ruWhy: false,
  /** Serve this explanation for every question instead (e.g. a real bank one). */
  why: null as null | { en: string; ru?: string; uk?: string; de?: string },
}));

const {
  auth,
  bootstrapFromDiagnostic,
  startOrResumeAttempt,
  appendAnswer,
  completeAttempt,
  getPlacementContext,
  setNativeLanguage,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  bootstrapFromDiagnostic: vi.fn(),
  startOrResumeAttempt: vi.fn(),
  appendAnswer: vi.fn(),
  completeAttempt: vi.fn(),
  getPlacementContext: vi.fn(),
  setNativeLanguage: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: {} }));
vi.mock('@/lib/auth', () => ({ auth }));
vi.stubEnv('AUTH_SECRET', 'test-secret-at-least-16-chars');
vi.mock('next-intl/server', () => ({ getLocale: async () => 'ru' }));
vi.mock('@/lib/learner', () => ({ bootstrapService: { bootstrapFromDiagnostic } }));
vi.mock('@englishlearn/db/queries/diagnostic-attempt', () => ({
  startOrResumeAttempt,
  appendAnswer,
  completeAttempt,
  // The 24 h idle rule is the query's (covered in packages/db); here every open attempt is fresh.
  getActiveAttempt: async (_db: unknown, userId: string) => {
    const a = store.attempts.find((x) => x.userId === userId && x.status === 'IN_PROGRESS');
    return a ? { attemptId: a.id } : null;
  },
  getCompletedAttempt: async (_db: unknown, userId: string) => {
    const a = store.attempts.find((x) => x.userId === userId && x.status === 'COMPLETED');
    return a ? { attemptId: a.id } : null;
  },
  getAttemptState: async (_db: unknown, attemptId: string, userId: string) => {
    const a = store.attempts.find((x) => x.id === attemptId && x.userId === userId);
    if (!a) return null;
    return {
      attemptId,
      status: a.status,
      answers: [...a.answers]
        .sort((x, y) => x.position - y.position)
        .map(({ userAnswer: _, ...rest }) => rest),
    };
  },
  getDiagnosticPool: async () =>
    store.bank.map(({ id, kind, cefrLevel }) => ({ id, kind, cefrLevel })),
  getBootstrapConcepts: async () => [{ id: 'grammar.a', category: 'GRAMMAR', cefrLevel: 'A2' }],
}));
vi.mock('@englishlearn/db/queries/diagnostic-reveal', () => ({
  getDiagnosticRevealFacts: async (_db: unknown, args: { userId: string; attemptId: string }) => {
    const a = store.attempts.find(
      (x) => x.id === args.attemptId && x.userId === args.userId && x.status === 'COMPLETED',
    );
    if (!a?.assessedLevel) return null;
    const facts = {
      assessedLevel: a.assessedLevel,
      answers: a.answers.map((x) => ({
        position: x.position,
        axis: x.axis,
        itemLevel: x.itemLevel,
        correct: x.correct,
        dontKnow: x.dontKnow,
        skillTag: store.tagged
          ? {
              id: `tag.${x.axis}`,
              slug: x.axis.toLowerCase(),
              title: `Tag ${x.axis}`,
              category: x.axis,
            }
          : null,
      })),
    };
    store.lastFacts = facts;
    return facts;
  },
  getDiagnosticReviewFacts: async (_db: unknown, args: { userId: string; attemptId: string }) => {
    const a = store.attempts.find(
      (x) => x.id === args.attemptId && x.userId === args.userId && x.status === 'COMPLETED',
    );
    if (!a) return null;
    return {
      answers: [...a.answers]
        .sort((x, y) => x.position - y.position)
        .map((x) => {
          const q = store.bank.find((b) => b.id === x.itemId);
          if (!q) throw new Error(`no ${x.itemId}`);
          return {
            position: x.position,
            axis: x.axis,
            stem: q.stem,
            choices: q.choices,
            correctIndex: q.key,
            chosen: x.dontKnow ? null : x.userAnswer,
            correct: x.correct,
            dontKnow: x.dontKnow,
            explanation: store.why ?? {
              en: `Why ${q.id}`,
              ...(store.ruWhy ? { ru: `Почему ${q.id}` } : {}),
            },
          };
        }),
    };
  },
  getPlacementContext,
}));
vi.mock('@englishlearn/db/queries/student-profile', () => ({
  getNativeLanguage: async (_db: unknown, userId: string) => store.languages.get(userId) ?? null,
  setNativeLanguage,
}));
vi.mock('@englishlearn/db/queries/exercises', () => ({
  // The real query returns cefrLevel and kind too; the orchestrator must drop them.
  getDiagnosticItemForStudent: async (id: string) => {
    const q = store.bank.find((x) => x.id === id);
    return q
      ? { id: q.id, cefrLevel: q.cefrLevel, kind: q.kind, stem: q.stem, choices: q.choices }
      : null;
  },
  checkDiagnosticAnswer: async (id: string, choiceIndex: unknown) => {
    const q = store.bank.find((x) => x.id === id);
    return q ? { correct: choiceIndex === q.key } : null;
  },
  getConceptTitles: async (ids: string[], locale: string) =>
    new Map(ids.map((id) => [id, `${locale}:${id}`])),
}));

const { saveNativeLanguageAction, startDiagnosticAction, submitDiagnosticAnswerAction } =
  await import('@/app/[locale]/(student)/diagnostic/actions');
const { getDiagnosticReview, isDiagnosticDone, peekDiagnosticStep } = await import(
  '@/lib/diagnostic'
);
const { DIAGNOSTIC_BANK } = await import('@englishlearn/learner-model/seed/diagnostic');
const { decryptItemRef, encryptItemRef, ITEM_REF_TTL_MS } = await import('@/lib/crypto/item-ref');

/** The in-memory attempt queries, with the database's semantics. */
function useMemoryAttempts() {
  startOrResumeAttempt.mockImplementation(async (_db: unknown, userId: string) => {
    const open = store.attempts.find((x) => x.userId === userId && x.status === 'IN_PROGRESS');
    if (open) return { attemptId: open.id, resumed: true };
    store.nextId += 1;
    const attempt: Attempt = {
      id: `att-${store.nextId}`,
      userId,
      status: 'IN_PROGRESS',
      answers: [],
    };
    store.attempts.push(attempt);
    return { attemptId: attempt.id, resumed: false };
  });
  appendAnswer.mockImplementation(
    async (
      _db: unknown,
      input: Omit<Answer, 'axis' | 'itemLevel'> & { attemptId: string; userId: string },
    ) => {
      const a = store.attempts.find(
        (x) => x.id === input.attemptId && x.userId === input.userId && x.status === 'IN_PROGRESS',
      );
      if (!a) return { ok: false, error: 'NOT_IN_PROGRESS' };
      const q = store.bank.find((x) => x.id === input.itemId);
      if (!q) return { ok: false, error: 'ITEM_NOT_FOUND' };
      if (a.answers.some((x) => x.position === input.position || x.itemId === input.itemId)) {
        return { ok: false, error: 'DUPLICATE' };
      }
      a.answers.push({
        position: input.position,
        itemId: input.itemId,
        axis: q.kind,
        itemLevel: q.cefrLevel as Level,
        correct: input.correct,
        dontKnow: input.dontKnow,
        userAnswer: input.userAnswer,
      });
      return { ok: true };
    },
  );
  completeAttempt.mockImplementation(
    async (_db: unknown, input: { attemptId: string; userId: string; assessedLevel: string }) => {
      const a = store.attempts.find(
        (x) => x.id === input.attemptId && x.userId === input.userId && x.status === 'IN_PROGRESS',
      );
      if (!a) return { won: false };
      a.status = 'COMPLETED';
      a.assessedLevel = input.assessedLevel;
      return { won: true };
    },
  );
}

const asStudent = (id = 'u1') => auth.mockResolvedValue({ user: { id, role: 'STUDENT' } });

async function currentQuestion() {
  const step = await startDiagnosticAction();
  if (!step.ok || step.value.kind !== 'question')
    throw new Error(`no question: ${JSON.stringify(step)}`);
  return step.value.question;
}

/** The bank id behind a question's opaque reference, as the server reads it. */
async function idOf(q: { item: { ref: string } }, userId = 'u1') {
  const id = await decryptItemRef(q.item.ref, userId);
  if (!id.ok) throw new Error(`bad ref: ${id.error}`);
  return id.value;
}

/** A question with its reference left out: references differ on every issue. */
function withoutRef<Q extends { item: { ref: string } }>(q: Q) {
  return { ...q, item: { ...q.item, ref: expect.any(String) } };
}

function stepWithoutRef<S extends { kind: string }>(step: S) {
  return 'question' in step && step.kind === 'question'
    ? { ...step, question: withoutRef(step.question as { item: { ref: string } }) }
    : step;
}

/** Answer the current question; right = pick the key. */
async function answer(right: boolean) {
  const q = await currentQuestion();
  const id = await idOf(q);
  const key = BANK.find((x) => x.id === id)?.key ?? 0;
  return submitDiagnosticAnswerAction({
    attemptId: q.attemptId,
    position: q.position,
    itemRef: q.item.ref,
    choiceIndex: right ? key : (key + 1) % 4,
  });
}

/** Nothing a learner receives may reveal the key, the verdict or the level. */
function expectNoLeak(payload: unknown) {
  const json = JSON.stringify(payload);
  for (const word of [
    'correct',
    'key',
    'explanation',
    'SECRET',
    'cefrLevel',
    'itemLevel',
    'verdict',
  ]) {
    expect(json, word).not.toContain(word);
  }
}

/** All 16 answered right: both axes, and so the attempt, at C1. */
const RESULT_ALL_RIGHT = {
  level: 'C1',
  // Grammar first, as on the screen.
  axes: [
    { axis: 'GRAMMAR', level: 'C1' },
    { axis: 'VOCAB', level: 'C1' },
  ],
  // The concept nearest C1 among the practisable ones, titled in the request locale.
  startConcept: { title: 'ru:vocab.b' },
};

beforeEach(() => {
  vi.clearAllMocks();
  store.attempts = [];
  store.bank = BANK.map(({ explanation: _, ...q }) => q);
  store.nextId = 0;
  store.tagged = false;
  store.lastFacts = null;
  store.ruWhy = false;
  store.why = null;
  // Most tests are about the test itself: these learners chose a language already.
  store.languages = new Map([
    ['u1', 'ru'],
    ['u2', 'ru'],
  ]);
  setNativeLanguage.mockImplementation(async (_db: unknown, userId: string, language: string) => {
    store.languages.set(userId, language);
  });
  store.context = {
    concepts: [
      { id: 'grammar.a', cefrLevel: 'A2' },
      { id: 'vocab.b', cefrLevel: 'B1' },
    ],
    masteries: [],
    prereqEdges: [],
  };
  getPlacementContext.mockImplementation(async () => store.context);
  useMemoryAttempts();
  bootstrapFromDiagnostic.mockResolvedValue({
    ok: true,
    occurredAt: 1n,
    bootstrappedConceptIds: [],
    skipped: [],
  });
  asStudent();
});

describe('access', () => {
  it('requires a signed-in student', async () => {
    auth.mockResolvedValue(null);
    expect(await startDiagnosticAction()).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    for (const role of ['TUTOR', 'ADMIN']) {
      auth.mockResolvedValue({ user: { id: 'u1', role } });
      expect(await startDiagnosticAction()).toEqual({ ok: false, error: 'FORBIDDEN' });
      expect(
        await submitDiagnosticAnswerAction({
          attemptId: 'a',
          position: 0,
          itemRef: 'q',
          dontKnow: true,
        }),
      ).toEqual({ ok: false, error: 'FORBIDDEN' });
    }
    expect(startOrResumeAttempt).not.toHaveBeenCalled();
  });

  it('rejects malformed input', async () => {
    const q = await currentQuestion();
    for (const bad of [
      { attemptId: q.attemptId, position: 0, itemRef: q.item.ref, choiceIndex: 9 },
      { attemptId: q.attemptId, position: 0, itemRef: q.item.ref, choiceIndex: 1.5 },
      { attemptId: q.attemptId, position: 16, itemRef: q.item.ref, choiceIndex: 0 },
      { attemptId: q.attemptId, position: 0, itemRef: q.item.ref, choiceIndex: 0, dontKnow: true },
    ]) {
      expect(await submitDiagnosticAnswerAction(bad as never), JSON.stringify(bad)).toEqual({
        ok: false,
        error: 'INVALID',
      });
    }
  });

  it("another learner's attempt is not theirs to answer", async () => {
    const q = await currentQuestion();
    asStudent('u2');
    expect(
      await submitDiagnosticAnswerAction({
        attemptId: q.attemptId,
        position: q.position,
        itemRef: q.item.ref,
        choiceIndex: 0,
      }),
    ).toEqual({ ok: false, error: 'NOT_IN_PROGRESS' });
    expect(appendAnswer).not.toHaveBeenCalled();
  });
});

describe('no feedback during the test', () => {
  it('a question carries its stem and choices only', async () => {
    const step = await startDiagnosticAction();
    expect(
      step.ok && step.value.kind === 'question' && Object.keys(step.value.question.item),
    ).toEqual(['ref', 'stem', 'choices']);
    expectNoLeak(step);
  });

  it('a question never shows its item id, and so not its level (S2)', async () => {
    for (let i = 0; i < 4; i++) {
      const q = await currentQuestion();
      const id = await idOf(q);
      expect(JSON.stringify(q)).not.toContain(id);
      expect(Buffer.from(q.item.ref, 'base64url').toString('latin1')).not.toContain(id);
      // Bank ids here are `q-{axis}-{level}-{n}`, like `seed-diag-{axis}-{level}-{nn}`.
      // The fixture's stem names its level on purpose (the real ones do not);
      // the ref is random base64 and may contain "B1" by chance.
      const rest = JSON.stringify({ ...q, item: { ...q.item, stem: '', ref: '' } });
      for (const level of LEVELS) expect(rest, level).not.toContain(level);
      await answer(true);
    }
  });

  it('the reply to a right or a wrong answer looks the same and says nothing about it', async () => {
    const right = await answer(true);
    const wrong = await answer(false);
    expectNoLeak(right);
    expectNoLeak(wrong);
    expect(right.ok && Object.keys(right.value)).toEqual(['stale', 'step']);
  });
});

describe('the attempt', () => {
  it('resumes on reload: the same attempt and the same question', async () => {
    await answer(true);
    const a = await currentQuestion();
    const b = await currentQuestion();
    expect(b).toEqual(withoutRef(a));
    expect(await idOf(b)).toBe(await idOf(a));
    expect(a.position).toBe(1);
    expect(store.attempts).toHaveLength(1);
  });

  it('an answer to a question other than the current one is stale and not recorded', async () => {
    const q = await currentQuestion();
    const id = await idOf(q);
    const other = BANK.find((x) => x.kind === 'GRAMMAR' && x.id !== id);
    const res = await submitDiagnosticAnswerAction({
      attemptId: q.attemptId,
      position: q.position,
      itemRef: await encryptItemRef({ itemId: other?.id ?? '', userId: 'u1' }),
      choiceIndex: 0,
    });
    expect(res).toEqual({
      ok: true,
      value: { stale: true, step: { kind: 'question', question: withoutRef(q) } },
    });
    expect(store.attempts[0]?.answers).toHaveLength(0);
    expect(appendAnswer).not.toHaveBeenCalled();
  });

  it('a forged, foreign or expired reference is stale and not recorded', async () => {
    const q = await currentQuestion();
    const id = await idOf(q);
    const now = Date.now();
    for (const itemRef of [
      // The raw id, as a client that guessed it would send it.
      id,
      // A valid reference to the right item, issued to another learner.
      await encryptItemRef({ itemId: id, userId: 'u2' }),
      // Issued for this learner more than 24 h ago.
      await encryptItemRef({ itemId: id, userId: 'u1' }, now - ITEM_REF_TTL_MS - 1),
    ]) {
      const res = await submitDiagnosticAnswerAction({
        attemptId: q.attemptId,
        position: q.position,
        itemRef,
        choiceIndex: 0,
      });
      expect(res.ok && res.value.stale, itemRef).toBe(true);
    }
    expect(appendAnswer).not.toHaveBeenCalled();
    // The fresh reference still works.
    await answer(true);
    expect(store.attempts[0]?.answers).toHaveLength(1);
  });

  it('a double submit lands on the same next step with one stored answer', async () => {
    const q = await currentQuestion();
    const input = {
      attemptId: q.attemptId,
      position: q.position,
      itemRef: q.item.ref,
      choiceIndex: 0,
    };
    const first = await submitDiagnosticAnswerAction(input);
    const second = await submitDiagnosticAnswerAction(input);
    expect(first.ok && second.ok && stepWithoutRef(second.value.step)).toEqual(
      first.ok && stepWithoutRef(first.value.step),
    );
    expect(store.attempts[0]?.answers).toHaveLength(1);
  });

  it('two concurrent submits of one answer: both get the next step, one is stored', async () => {
    const q = await currentQuestion();
    const input = {
      attemptId: q.attemptId,
      position: q.position,
      itemRef: q.item.ref,
      choiceIndex: 0,
    };
    const [a, b] = await Promise.all([
      submitDiagnosticAnswerAction(input),
      submitDiagnosticAnswerAction(input),
    ]);
    expect(a.ok && stepWithoutRef(a.value.step)).toEqual(b.ok && stepWithoutRef(b.value.step));
    expect(store.attempts[0]?.answers).toHaveLength(1);
  });

  it('records the chosen option as text, not as its index', async () => {
    const q = await currentQuestion();
    await submitDiagnosticAnswerAction({
      attemptId: q.attemptId,
      position: q.position,
      itemRef: q.item.ref,
      choiceIndex: 2,
    });
    expect(store.attempts[0]?.answers[0]?.userAnswer).toBe('y');
  });

  it('an index past the options of the question is refused and not recorded', async () => {
    const q = await currentQuestion();
    // The schema admits up to 6 options; this question has 4.
    const res = await submitDiagnosticAnswerAction({
      attemptId: q.attemptId,
      position: q.position,
      itemRef: q.item.ref,
      choiceIndex: 4,
    });
    expect(res).toEqual({ ok: false, error: 'INVALID_CHOICE' });
    expect(store.attempts[0]?.answers).toHaveLength(0);
  });

  it('records "I don\'t know" as a wrong answer with an empty choice', async () => {
    const q = await currentQuestion();
    await submitDiagnosticAnswerAction({
      attemptId: q.attemptId,
      position: q.position,
      itemRef: q.item.ref,
      dontKnow: true,
    });
    expect(store.attempts[0]?.answers[0]).toMatchObject({
      correct: false,
      dontKnow: true,
      userAnswer: '',
    });
  });

  it('a bank that runs dry is an error, not a crash', async () => {
    store.bank = store.bank.filter((q) => q.kind === 'GRAMMAR');
    await answer(true);
    expect(await startDiagnosticAction()).toEqual({ ok: false, error: 'BANK_EXHAUSTED' });
  });
});

describe('completion', () => {
  it('the 16th answer completes the attempt and bootstraps exactly once', async () => {
    let last: Awaited<ReturnType<typeof answer>> | undefined;
    for (let i = 0; i < 16; i++) last = await answer(true);
    const attemptId = store.attempts[0]?.id;
    expect(last).toEqual({
      ok: true,
      value: { stale: false, step: { kind: 'completed', result: RESULT_ALL_RIGHT } },
    });
    expect(store.attempts[0]).toMatchObject({ status: 'COMPLETED', assessedLevel: 'C1' });

    expect(bootstrapFromDiagnostic).toHaveBeenCalledTimes(1);
    const input = bootstrapFromDiagnostic.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      userId: 'u1',
      diagnosticAttemptId: attemptId,
      assessedLevel: 'C1',
    });
    expect(input.answers).toHaveLength(16);
    expect(input.answers[0]).toEqual({
      axis: 'GRAMMAR',
      correct: true,
      dontKnow: false,
      itemLevel: 'B1',
      position: 0,
    });
  });

  it('a learner with a completed attempt gets the result, never a new attempt', async () => {
    for (let i = 0; i < 16; i++) await answer(true);
    startOrResumeAttempt.mockClear();
    const step = await startDiagnosticAction();
    expect(step).toEqual({
      ok: true,
      value: { kind: 'completed', result: RESULT_ALL_RIGHT },
    });
    expect(startOrResumeAttempt).not.toHaveBeenCalled();
    expect(store.attempts).toHaveLength(1);
  });

  it('a bootstrap that failed after completion is finished on the next visit', async () => {
    bootstrapFromDiagnostic.mockRejectedValueOnce(new Error('db down'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let last: Awaited<ReturnType<typeof answer>> | undefined;
    for (let i = 0; i < 16; i++) last = await answer(true);
    // The learner still sees the result.
    expect(last?.ok && last.value.step.kind).toBe('completed');
    expect(errors).toHaveBeenCalled();

    await startDiagnosticAction();
    expect(bootstrapFromDiagnostic).toHaveBeenCalledTimes(2);
    expect(bootstrapFromDiagnostic.mock.calls[1]?.[0]).toEqual(
      bootstrapFromDiagnostic.mock.calls[0]?.[0],
    );
    errors.mockRestore();
  });

  it('16 answers stored but the attempt never completed (crash) → the next visit completes it', async () => {
    for (let i = 0; i < 15; i++) await answer(true);
    // The 16th answer is stored, then the process dies before completeAttempt.
    completeAttempt.mockImplementationOnce(async () => {
      throw new Error('process died');
    });
    await expect(answer(true)).rejects.toThrow('process died');
    expect(store.attempts[0]).toMatchObject({ status: 'IN_PROGRESS' });
    expect(store.attempts[0]?.answers).toHaveLength(16);
    expect(bootstrapFromDiagnostic).not.toHaveBeenCalled();

    const step = await startDiagnosticAction();
    expect(step).toEqual({
      ok: true,
      value: { kind: 'completed', result: RESULT_ALL_RIGHT },
    });
    expect(store.attempts[0]).toMatchObject({ status: 'COMPLETED' });
    expect(bootstrapFromDiagnostic).toHaveBeenCalledTimes(1);
  });
});

describe('peek (opening /diagnostic)', () => {
  it('a learner who never started gets the intro, and nothing is created', async () => {
    expect(await peekDiagnosticStep('u1', new Date(), 'ru')).toEqual({
      ok: true,
      value: { kind: 'intro' },
    });
    expect(startOrResumeAttempt).not.toHaveBeenCalled();
    expect(store.attempts).toHaveLength(0);
  });

  it('an attempt in progress resumes at its current question', async () => {
    await answer(true);
    await answer(false);
    const current = await currentQuestion();
    startOrResumeAttempt.mockClear();
    expect(await peekDiagnosticStep('u1', new Date(), 'ru')).toEqual({
      ok: true,
      value: { kind: 'question', question: withoutRef(current) },
    });
    expect(startOrResumeAttempt).not.toHaveBeenCalled();
  });

  it('a completed attempt shows the result', async () => {
    for (let i = 0; i < 16; i++) await answer(true);
    expect(await peekDiagnosticStep('u1', new Date(), 'ru')).toEqual({
      ok: true,
      value: { kind: 'completed', result: RESULT_ALL_RIGHT },
    });
  });
});

describe('the result', () => {
  async function passAll(how: (i: number) => 'right' | 'dontKnow' = () => 'right') {
    let last: Awaited<ReturnType<typeof answer>> | undefined;
    for (let i = 0; i < 16; i++) {
      if (how(i) === 'right') last = await answer(true);
      else {
        const q = await currentQuestion();
        last = await submitDiagnosticAnswerAction({
          attemptId: q.attemptId,
          position: q.position,
          itemRef: q.item.ref,
          dontKnow: true,
        });
      }
    }
    if (!last?.ok || last.value.step.kind !== 'completed') throw new Error('not completed');
    return last.value.step;
  }

  it('carries levels and a start topic only, even when the reveal has tag tallies', async () => {
    store.tagged = true;
    const step = await passAll((i) => (i % 3 === 0 ? 'dontKnow' : 'right'));
    // The fixture is not vacuous: the reveal was fed tagged answers.
    expect(store.lastFacts?.answers.length).toBe(16);
    expect(store.lastFacts?.answers.every((a) => a.skillTag !== null)).toBe(true);

    expectNoLeak(step);
    const json = JSON.stringify(step);
    for (const word of ['accuracy', 'dontKnow', 'answered', 'skillTag', 'Tag ', 'untagged']) {
      expect(json, word).not.toContain(word);
    }
    expect(Object.keys(step.result).sort()).toEqual(['axes', 'level', 'startConcept']);
    for (const axis of step.result.axes)
      expect(Object.keys(axis).sort()).toEqual(['axis', 'level']);
  });

  it('reads the placement context after the bootstrap', async () => {
    await passAll();
    expect(bootstrapFromDiagnostic.mock.invocationCallOrder[0]).toBeLessThan(
      getPlacementContext.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('never recommends a practised topic, even the weakest one', async () => {
    const weak = { conceptId: 'vocab.weak', pKnown: 0.05, lastUpdatedAt: 0, pForgetLambda: 0.01 };
    store.context = {
      concepts: [
        { id: 'vocab.weak', cefrLevel: 'B1' },
        { id: 'vocab.fresh', cefrLevel: 'B1' },
      ],
      masteries: [
        { ...weak, observationCount: 3 },
        {
          conceptId: 'vocab.fresh',
          pKnown: 0.3,
          observationCount: 0,
          lastUpdatedAt: 0,
          pForgetLambda: 0.01,
        },
      ],
      prereqEdges: [],
    };
    expect((await passAll()).result.startConcept).toEqual({ title: 'ru:vocab.fresh' });

    // Control: unpractised, the weaker prior would have won.
    store.context.masteries[0] = { ...weak, observationCount: 0 };
    const again = await peekDiagnosticStep('u1', new Date(), 'ru');
    expect(again.ok && again.value.kind === 'completed' && again.value.result.startConcept).toEqual(
      {
        title: 'ru:vocab.weak',
      },
    );
  });

  it('no topic to suggest: the level without a recommendation', async () => {
    store.context.concepts = [];
    expect((await passAll()).result).toEqual({ ...RESULT_ALL_RIGHT, startConcept: null });
  });

  it('a completed attempt with no level shows the level-less result, not a crash', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.attempts.push({ id: 'att-x', userId: 'u1', status: 'COMPLETED', answers: [] });
    expect(await peekDiagnosticStep('u1', new Date(), 'ru')).toEqual({
      ok: true,
      value: { kind: 'completed', result: { level: null, axes: [], startConcept: null } },
    });
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('a stored level that differs from the recomputed one is a warning with ids and levels only', async () => {
    await passAll();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const attempt = store.attempts[0];
    if (!attempt) throw new Error('no attempt');
    attempt.assessedLevel = 'A2';
    const step = await peekDiagnosticStep('u1', new Date(), 'ru');
    // The screen shows the recomputed level.
    expect(step.ok && step.value.kind === 'completed' && step.value.result.level).toBe('C1');
    expect(warn).toHaveBeenCalledTimes(1);
    const args = warn.mock.calls[0] ?? [];
    expect(args).toHaveLength(1);
    expect(args[0]).toBe(
      `[diagnostic] level mismatch for attempt ${attempt.id}: stored A2, recomputed C1`,
    );
    warn.mockRestore();
  });

  it('a failing result lookup still completes, without a level', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    getPlacementContext.mockRejectedValue(new Error('db down'));
    expect((await passAll()).result).toEqual({ level: null, axes: [], startConcept: null });
    expect(store.attempts[0]).toMatchObject({ status: 'COMPLETED' });
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('isDiagnosticDone (the one "done" signal for every CTA)', () => {
  it('not started or in progress: not done', async () => {
    expect(await isDiagnosticDone('u1')).toBe(false);
    await answer(true);
    expect(await isDiagnosticDone('u1')).toBe(false);
  });

  it('a completed attempt is done even when its bootstrap wrote no event', async () => {
    bootstrapFromDiagnostic.mockResolvedValue({ ok: false, error: 'NO_CONCEPTS_BOOTSTRAPPED' });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (let i = 0; i < 16; i++) await answer(true);
    expect(store.attempts[0]).toMatchObject({ status: 'COMPLETED' });
    expect(await isDiagnosticDone('u1')).toBe(true);
    // Someone else's completed attempt is not this learner's.
    expect(await isDiagnosticDone('u2')).toBe(false);
    errors.mockRestore();
  });
});

describe('the native language, before a new attempt', () => {
  it('opening /diagnostic without one shows the language step and writes nothing', async () => {
    store.languages.delete('u1');
    expect(await peekDiagnosticStep('u1', new Date(), 'ru')).toEqual({
      ok: true,
      value: { kind: 'language' },
    });
    // A blank stored value is not a choice either.
    store.languages.set('u1', '  ');
    expect(await peekDiagnosticStep('u1', new Date(), 'ru')).toEqual({
      ok: true,
      value: { kind: 'language' },
    });
    expect(setNativeLanguage).not.toHaveBeenCalled();
    expect(startOrResumeAttempt).not.toHaveBeenCalled();
  });

  it('any stored value counts as chosen, even one outside the list', async () => {
    store.languages.set('u1', 'pl');
    expect(await peekDiagnosticStep('u1', new Date(), 'ru')).toEqual({
      ok: true,
      value: { kind: 'intro' },
    });
  });

  it('Start without one creates no attempt', async () => {
    store.languages.set('u1', null);
    expect(await startDiagnosticAction()).toEqual({ ok: false, error: 'NEEDS_LANGUAGE' });
    expect(startOrResumeAttempt).not.toHaveBeenCalled();
    expect(store.attempts).toHaveLength(0);
  });

  it('never hides an attempt in progress or a result behind the language step', async () => {
    await answer(true);
    store.languages.set('u1', null);
    const peek = await peekDiagnosticStep('u1', new Date(), 'ru');
    expect(peek.ok && peek.value.kind).toBe('question');
    const resumed = await startDiagnosticAction();
    expect(resumed.ok && resumed.value.kind).toBe('question');

    store.languages.set('u1', 'ru');
    for (let i = 1; i < 16; i++) await answer(true);
    store.languages.set('u1', null);
    expect(await peekDiagnosticStep('u1', new Date(), 'ru')).toEqual({
      ok: true,
      value: { kind: 'completed', result: RESULT_ALL_RIGHT },
    });
    expect(await startDiagnosticAction()).toEqual({
      ok: true,
      value: { kind: 'completed', result: RESULT_ALL_RIGHT },
    });
  });

  it('saving requires a signed-in student', async () => {
    auth.mockResolvedValue(null);
    expect(await saveNativeLanguageAction({ language: 'ru' })).toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
    });
    for (const role of ['TUTOR', 'ADMIN']) {
      auth.mockResolvedValue({ user: { id: 'u1', role } });
      expect(await saveNativeLanguageAction({ language: 'ru' })).toEqual({
        ok: false,
        error: 'FORBIDDEN',
      });
    }
    expect(setNativeLanguage).not.toHaveBeenCalled();
  });

  it('saves only a value from the list — anything else is INVALID and never reaches the database', async () => {
    for (const bad of [
      { language: 'en' },
      { language: 'pl' },
      { language: 'RU' },
      { language: '' },
      { language: 1 },
      {},
      { language: 'ru', userId: 'u2' },
      'ru',
      null,
    ]) {
      expect(await saveNativeLanguageAction(bad as never), JSON.stringify(bad)).toEqual({
        ok: false,
        error: 'INVALID',
      });
    }
    expect(setNativeLanguage).not.toHaveBeenCalled();
  });

  it('a valid choice is stored for the signed-in learner, then the intro follows', async () => {
    store.languages.delete('u1');
    expect(await saveNativeLanguageAction({ language: 'uk' })).toEqual({
      ok: true,
      value: { kind: 'intro' },
    });
    expect(setNativeLanguage).toHaveBeenCalledTimes(1);
    expect(setNativeLanguage.mock.calls[0]?.slice(1)).toEqual(['u1', 'uk']);
    expect(store.attempts).toHaveLength(0);
    // …and now Start starts.
    const step = await startDiagnosticAction();
    expect(step.ok && step.value.kind).toBe('question');
  });
});

describe('the review', () => {
  /** 16 answers: right, wrong, "I don't know" in turn. */
  async function passMixed() {
    for (let i = 0; i < 16; i++) {
      if (i % 3 === 2) {
        const q = await currentQuestion();
        await submitDiagnosticAnswerAction({
          attemptId: q.attemptId,
          position: q.position,
          itemRef: q.item.ref,
          dontKnow: true,
        });
      } else await answer(i % 3 === 0);
    }
    expect(store.attempts[0]?.status).toBe('COMPLETED');
  }

  it('none before the test is finished: not started, then in progress', async () => {
    expect(await getDiagnosticReview('u1', 'ru')).toBeNull();
    await answer(true);
    expect(await getDiagnosticReview('u1', 'ru')).toBeNull();
  });

  it("only the learner's own attempt", async () => {
    await passMixed();
    expect(await getDiagnosticReview('u2', 'ru')).toBeNull();
    expect((await getDiagnosticReview('u1', 'ru'))?.questions).toHaveLength(16);
  });

  it('every question with the answer, the key and a stored verdict, in order', async () => {
    await passMixed();
    const review = await getDiagnosticReview('u1', 'en');
    const stored = store.attempts[0]?.answers ?? [];
    expect(review?.questions.map((q) => q.position)).toEqual([...Array(16).keys()]);
    for (const q of review?.questions ?? []) {
      const a = stored.find((x) => x.position === q.position);
      const item = BANK.find((b) => b.id === a?.itemId);
      expect(q.stem).toBe(item?.stem);
      expect(q.correctIndex).toBe(item?.key);
      const outcome =
        q.position % 3 === 2 ? 'dontKnow' : q.position % 3 === 0 ? 'correct' : 'incorrect';
      expect(q.outcome, `position ${q.position}`).toBe(outcome);
      expect(q.chosenIndex).toBe(
        outcome === 'dontKnow'
          ? null
          : outcome === 'correct'
            ? q.correctIndex
            : (q.correctIndex + 1) % 4,
      );
    }
  });

  it('carries the allowlisted fields only: no ids, no question level, no tally', async () => {
    await passMixed();
    const review = await getDiagnosticReview('u1', 'en');
    expect(Object.keys(review ?? {})).toEqual(['questions']);
    for (const q of review?.questions ?? []) {
      expect(Object.keys(q).sort()).toEqual([
        'axis',
        'choices',
        'chosenIndex',
        'correctIndex',
        'explanation',
        'outcome',
        'position',
        'stem',
      ]);
    }
    // The fixture's explanation names the item; the view's other fields must not.
    const json = JSON.stringify(review?.questions.map(({ explanation: _, ...q }) => q));
    const ids = store.attempts[0]?.answers.map((a) => a.itemId) ?? [];
    for (const word of [
      'itemId',
      'itemLevel',
      'cefrLevel',
      'attemptId',
      'att-',
      'userAnswer',
      ...ids,
    ]) {
      expect(json, word).not.toContain(word);
    }
  });

  it('explanations in the native language where translated, else English with lang="en"', async () => {
    await passMixed();
    const first = async (ui: 'ru' | 'en') => (await getDiagnosticReview('u1', ui))?.questions[0];
    // Native ru, no translation yet: English, marked as such.
    expect((await first('ru'))?.explanation).toMatchObject({ lang: 'en' });
    store.ruWhy = true;
    expect((await first('en'))?.explanation).toMatchObject({ lang: 'ru' });
    expect((await first('en'))?.explanation?.text).toMatch(/^Почему /);
    // "Other": the source language, whatever the interface.
    store.languages.set('u1', 'other');
    expect((await first('ru'))?.explanation).toMatchObject({ lang: 'en' });
  });

  it("the real bank's explanations: the native language's own, by contentLocale", async () => {
    await passMixed();
    const shown = async (ui: 'ru' | 'en' | 'uk' | 'de') =>
      (await getDiagnosticReview('u1', ui))?.questions[0]?.explanation;
    for (const item of DIAGNOSTIC_BANK) {
      const why = item.content.localized?.explanation;
      store.why = why ?? null;
      // A chosen ru/uk/de wins over the interface locale.
      for (const native of ['ru', 'uk', 'de'] as const) {
        store.languages.set('u1', native);
        expect(await shown('en'), `${item.id} ${native}`).toEqual({
          text: why?.[native],
          lang: native,
        });
      }
      // "Other": the source language, whatever the interface.
      store.languages.set('u1', 'other');
      expect(await shown('de'), item.id).toEqual({ text: why?.en, lang: 'en' });
      // Not chosen: the interface locale.
      store.languages.set('u1', null);
      expect(await shown('uk'), item.id).toEqual({ text: why?.uk, lang: 'uk' });
    }
  });

  it('the verdict is the stored one, even when the key changed since', async () => {
    await passMixed();
    const first = store.attempts[0]?.answers.find((a) => a.position === 0);
    const item = store.bank.find((b) => b.id === first?.itemId);
    if (item) item.key = (item.key + 1) % 4;
    const review = await getDiagnosticReview('u1', 'en');
    expect(review?.questions[0]).toMatchObject({ outcome: 'correct', correctIndex: item?.key });
  });

  it('an answer no longer among the options names none', async () => {
    await passMixed();
    const wrong = store.attempts[0]?.answers.find((a) => a.position === 1);
    if (wrong) wrong.userAnswer = 'an option since removed';
    const review = await getDiagnosticReview('u1', 'en');
    expect(review?.questions[1]).toMatchObject({ outcome: 'incorrect', chosenIndex: null });
  });

  it('reading the review writes nothing', async () => {
    await passMixed();
    vi.clearAllMocks();
    await getDiagnosticReview('u1', 'ru');
    expect(bootstrapFromDiagnostic).not.toHaveBeenCalled();
    expect(completeAttempt).not.toHaveBeenCalled();
    expect(appendAnswer).not.toHaveBeenCalled();
    expect(startOrResumeAttempt).not.toHaveBeenCalled();
  });
});
