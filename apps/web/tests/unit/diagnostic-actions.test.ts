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
}));

const { auth, bootstrapFromDiagnostic, startOrResumeAttempt, appendAnswer, completeAttempt } =
  vi.hoisted(() => ({
    auth: vi.fn(),
    bootstrapFromDiagnostic: vi.fn(),
    startOrResumeAttempt: vi.fn(),
    appendAnswer: vi.fn(),
    completeAttempt: vi.fn(),
  }));

vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: {} }));
vi.mock('@/lib/auth', () => ({ auth }));
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
    return {
      assessedLevel: a.assessedLevel,
      levelTrajectory: [],
      answers: a.answers.map((x) => ({
        position: x.position,
        axis: x.axis,
        itemLevel: x.itemLevel,
        correct: x.correct,
        dontKnow: x.dontKnow,
        skillTag: null,
      })),
    };
  },
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
}));

const { startDiagnosticAction, submitDiagnosticAnswerAction } = await import(
  '@/app/[locale]/(student)/diagnostic/actions'
);
const { peekDiagnosticStep } = await import('@/lib/diagnostic');

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

/** Answer the current question; right = pick the key. */
async function answer(right: boolean) {
  const q = await currentQuestion();
  const key = BANK.find((x) => x.id === q.item.id)?.key ?? 0;
  return submitDiagnosticAnswerAction({
    attemptId: q.attemptId,
    position: q.position,
    itemId: q.item.id,
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

beforeEach(() => {
  vi.clearAllMocks();
  store.attempts = [];
  store.bank = BANK.map(({ explanation: _, ...q }) => q);
  store.nextId = 0;
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
          itemId: 'q',
          dontKnow: true,
        }),
      ).toEqual({ ok: false, error: 'FORBIDDEN' });
    }
    expect(startOrResumeAttempt).not.toHaveBeenCalled();
  });

  it('rejects malformed input', async () => {
    const q = await currentQuestion();
    for (const bad of [
      { attemptId: q.attemptId, position: 0, itemId: q.item.id, choiceIndex: 9 },
      { attemptId: q.attemptId, position: 0, itemId: q.item.id, choiceIndex: 1.5 },
      { attemptId: q.attemptId, position: 16, itemId: q.item.id, choiceIndex: 0 },
      { attemptId: q.attemptId, position: 0, itemId: q.item.id, choiceIndex: 0, dontKnow: true },
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
        itemId: q.item.id,
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
    ).toEqual(['id', 'stem', 'choices']);
    expectNoLeak(step);
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
    expect(b).toEqual(a);
    expect(a.position).toBe(1);
    expect(store.attempts).toHaveLength(1);
  });

  it('an answer to a question other than the current one is stale and not recorded', async () => {
    const q = await currentQuestion();
    const other = BANK.find((x) => x.kind === 'GRAMMAR' && x.id !== q.item.id);
    const res = await submitDiagnosticAnswerAction({
      attemptId: q.attemptId,
      position: q.position,
      itemId: other?.id ?? '',
      choiceIndex: 0,
    });
    expect(res).toEqual({
      ok: true,
      value: { stale: true, step: { kind: 'question', question: q } },
    });
    expect(store.attempts[0]?.answers).toHaveLength(0);
    expect(appendAnswer).not.toHaveBeenCalled();
  });

  it('a double submit lands on the same next step with one stored answer', async () => {
    const q = await currentQuestion();
    const input = {
      attemptId: q.attemptId,
      position: q.position,
      itemId: q.item.id,
      choiceIndex: 0,
    };
    const first = await submitDiagnosticAnswerAction(input);
    const second = await submitDiagnosticAnswerAction(input);
    expect(first.ok && second.ok && second.value.step).toEqual(first.ok && first.value.step);
    expect(store.attempts[0]?.answers).toHaveLength(1);
  });

  it('two concurrent submits of one answer: both get the next step, one is stored', async () => {
    const q = await currentQuestion();
    const input = {
      attemptId: q.attemptId,
      position: q.position,
      itemId: q.item.id,
      choiceIndex: 0,
    };
    const [a, b] = await Promise.all([
      submitDiagnosticAnswerAction(input),
      submitDiagnosticAnswerAction(input),
    ]);
    expect(a.ok && a.value.step).toEqual(b.ok && b.value.step);
    expect(store.attempts[0]?.answers).toHaveLength(1);
  });

  it('records "I don\'t know" as a wrong answer with an empty choice', async () => {
    const q = await currentQuestion();
    await submitDiagnosticAnswerAction({
      attemptId: q.attemptId,
      position: q.position,
      itemId: q.item.id,
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
      value: { stale: false, step: { kind: 'completed', attemptId } },
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
      value: { kind: 'completed', attemptId: store.attempts[0]?.id },
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
      value: { kind: 'completed', attemptId: store.attempts[0]?.id },
    });
    expect(store.attempts[0]).toMatchObject({ status: 'COMPLETED' });
    expect(bootstrapFromDiagnostic).toHaveBeenCalledTimes(1);
  });
});

describe('peek (opening /diagnostic)', () => {
  it('a learner who never started gets the intro, and nothing is created', async () => {
    expect(await peekDiagnosticStep('u1', new Date())).toEqual({
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
    expect(await peekDiagnosticStep('u1', new Date())).toEqual({
      ok: true,
      value: { kind: 'question', question: current },
    });
    expect(startOrResumeAttempt).not.toHaveBeenCalled();
  });

  it('a completed attempt shows the result', async () => {
    for (let i = 0; i < 16; i++) await answer(true);
    expect(await peekDiagnosticStep('u1', new Date())).toEqual({
      ok: true,
      value: { kind: 'completed', attemptId: store.attempts[0]?.id },
    });
  });
});
