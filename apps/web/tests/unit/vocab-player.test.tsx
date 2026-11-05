import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RECENT_EXCLUDE } from '@/lib/recent-refs';
import type { ClientVocabScope } from '@/lib/vocab-scope';
import type { VocabCardPayload, VocabFeedback } from '@/lib/vocab-session';
import en from '../../messages/en.json';
import { us } from './keys';

const {
  nextVocabCardAction,
  startVocabProofAction,
  startWordProofAction,
  submitVocabAttemptAction,
  push,
  hardReload,
  wordListMenuAction,
} = vi.hoisted(() => ({
  nextVocabCardAction: vi.fn(),
  startVocabProofAction: vi.fn(),
  startWordProofAction: vi.fn(),
  submitVocabAttemptAction: vi.fn(),
  push: vi.fn(),
  hardReload: vi.fn(),
  wordListMenuAction: vi.fn(),
}));
vi.mock('@/lib/hard-reload', () => ({ hardReload }));
vi.mock('@/app/[locale]/(student)/actions/vocab', () => ({
  nextVocabCardAction,
  startVocabProofAction,
  startWordProofAction,
  submitVocabAttemptAction,
}));
vi.mock('@/app/[locale]/(student)/actions/word-lists', () => ({
  wordListMenuAction,
  addWordsToListAction: vi.fn(),
  createWordListAction: vi.fn(),
}));
// The dialog has its own tests; here only the ref it is opened with matters.
vi.mock('@/app/[locale]/(student)/_components/feedback-dialog', () => ({
  FeedbackDialog: ({ open, vocabRef }: { open: boolean; vocabRef?: string }) =>
    open ? <div data-testid="report-dialog" data-vocab-ref={vocabRef} /> : null,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push }),
}));

const { VocabPlayer, VOCAB_SESSION_LENGTH } = await import(
  '@/app/[locale]/(student)/words/practice/vocab-player'
);

const p = en.student.words.player;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const base = { pos: 'NOUN', hint: null, canProve: false, isProof: false } as const;
const l1ToEn = (vocabRef: string, over: Partial<VocabCardPayload> = {}): VocabCardPayload => ({
  ...base,
  vocabRef,
  card: { mode: 'l1_to_en', gloss: 'дом', options: ['horse', 'house', 'mouse', 'hose'] },
  ...over,
});
const fullRecall = (vocabRef: string, over: Partial<VocabCardPayload> = {}): VocabCardPayload => ({
  ...base,
  vocabRef,
  card: { mode: 'full_recall', gloss: 'дом' },
  hint: 'h____',
  ...over,
});
const proofCard = (vocabRef: string, over: Partial<VocabCardPayload> = {}): VocabCardPayload => ({
  ...base,
  vocabRef,
  card: { mode: 'cued_recall', gloss: 'дом', cue: 'h____' },
  isProof: true,
  ...over,
});
const served = (card: VocabCardPayload) => ({
  ok: true,
  value: { status: 'card', remainingNew: 5, ...card },
});
const answered = (over: Partial<VocabFeedback> = {}) => ({
  ok: true,
  value: {
    status: 'answered',
    verdict: 'correct',
    correctIndex: 1,
    chosenIndex: 1,
    word: {
      lemma: 'house',
      ipa: 'haʊs',
      gloss: 'дом',
      definition: 'a building for people to live in',
      example: { sentence: 'Their house is old.', translation: 'Их дом старый.' },
    },
    proven: false,
    review: { kind: 'backInDays', days: 3 },
    ...over,
  } satisfies VocabFeedback,
});

function renderPlayer(scope?: ClientVocabScope, proveSlug?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <VocabPlayer scope={scope} proveSlug={proveSlug} />
    </NextIntlClientProvider>,
  );
}
const key = (k: string, target: Element | Window = window) =>
  act(() => {
    fireEvent.keyDown(target, us(k));
  });

// Focus moves in an effect after the card commits; once it is there the
// keyboard listener sees the new phase too.
const onChoiceCard = async () => {
  await waitFor(() => expect(document.activeElement?.id).toBe('vocab-prompt'));
};
const onTextCard = async () => {
  const field = await screen.findByRole('textbox', { name: p.answerLabel });
  await waitFor(() => expect(field).toHaveFocus());
  return field;
};
const onFeedback = async () => {
  await waitFor(() => expect(screen.getByRole('button', { name: /^Continue/ })).toHaveFocus());
};
const lastSubmit = () => submitVocabAttemptAction.mock.lastCall?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  nextVocabCardAction.mockReset();
  startVocabProofAction.mockReset();
  startWordProofAction.mockReset();
  submitVocabAttemptAction.mockReset();
  nextVocabCardAction.mockResolvedValue(served(l1ToEn('ref-2')));
  submitVocabAttemptAction.mockResolvedValue(answered());
});

describe('loading', () => {
  it('asks for the first card in the browser’s zone, for the chosen concept', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    renderPlayer({ kind: 'concept', conceptId: 'vocab.travel.a1' });
    await onChoiceCard();
    expect(nextVocabCardAction).toHaveBeenCalledExactlyOnceWith({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      scope: { kind: 'concept', conceptId: 'vocab.travel.a1' },
      recentVocabRefs: [],
    });
    expect(screen.getByText('дом')).toBeInTheDocument();
  });

  it('a lost first card offers Retry, focused', async () => {
    nextVocabCardAction.mockRejectedValueOnce(new Error('offline'));
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    renderPlayer();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(p.nextFailed);
    const retry = within(alert).getByRole('button', { name: 'Retry' });
    await waitFor(() => expect(retry).toHaveFocus());
    fireEvent.click(retry);
    await onChoiceCard();
    expect(nextVocabCardAction).toHaveBeenCalledTimes(2);
  });

  it('nothing left: the summary says so and links back to the overview', async () => {
    nextVocabCardAction.mockResolvedValueOnce({
      ok: true,
      value: { status: 'done', nextDueAt: null, remainingNew: 0 },
    });
    renderPlayer();
    expect(await screen.findByRole('heading', { name: p.done.emptyTitle })).toBeInTheDocument();
    expect(screen.getByText(p.done.nothingDue)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: p.done.overview })).toHaveAttribute('href', '/words');
    expect(screen.queryByRole('button', { name: p.done.again })).toBeNull();
  });
});

describe('choice modes', () => {
  it('1–4 choose, Enter checks: graded on the server with a fresh attempt key', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    renderPlayer();
    await onChoiceCard();
    expect(screen.getByText(p.instruction.l1_to_en)).toBeInTheDocument();
    key('2');
    expect(screen.getByRole('button', { name: /house/ })).toHaveAttribute('aria-pressed', 'true');
    key('Enter');
    await onFeedback();

    expect(submitVocabAttemptAction).toHaveBeenCalledExactlyOnceWith({
      vocabRef: 'ref-1',
      answer: { type: 'choice', index: 1 },
      hinted: false,
      timeMs: expect.any(Number),
      attemptKey: expect.stringMatching(UUID),
    });
    const verdict = document.querySelector('[data-verdict="correct"]');
    expect(verdict).toHaveTextContent('Correct');
    expect(verdict?.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('a building for people to live in')).toBeInTheDocument();
    // The feedback shows the word's US IPA with its tag (B6.4a).
    expect(screen.getByText('/haʊs/').closest('[data-ipa]')).toHaveTextContent('US/haʊs/');
    expect(screen.getByText('Their house is old.')).toBeInTheDocument();
    expect(screen.getByText('Их дом старый.')).toBeInTheDocument();
    expect(screen.getByText('Back in 3 days')).toBeInTheDocument();
  });

  it('Continue loads the next card, skipping the recent ones', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    renderPlayer();
    await onChoiceCard();
    key('2');
    key('Enter');
    await onFeedback();
    key('Enter');
    await waitFor(() => expect(nextVocabCardAction).toHaveBeenCalledTimes(2));
    expect(nextVocabCardAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ recentVocabRefs: ['ref-1'] }),
    );
  });

  it('keeps exactly the RECENT_EXCLUDE latest refs the server reads, no more', async () => {
    for (const n of [1, 2, 3, 4, 5]) {
      nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn(`ref-${n}`)));
    }
    renderPlayer();
    for (let shown = 1; shown <= 4; shown++) {
      await onChoiceCard();
      key('2');
      key('Enter');
      await onFeedback();
      key('Enter');
      await waitFor(() => expect(nextVocabCardAction).toHaveBeenCalledTimes(shown + 1));
    }
    await onChoiceCard();
    key('2');
    key('Enter');
    await onFeedback();
    key('Enter');
    await waitFor(() => expect(nextVocabCardAction).toHaveBeenCalledTimes(6));
    expect(RECENT_EXCLUDE).toBe(3);
    expect(nextVocabCardAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ recentVocabRefs: ['ref-3', 'ref-4', 'ref-5'] }),
    );
  });

  it('en_to_l1 shows the word, its part of speech and the US IPA (B6.4a)', async () => {
    nextVocabCardAction.mockResolvedValueOnce(
      served({
        ...base,
        vocabRef: 'ref-1',
        card: { mode: 'en_to_l1', word: 'house', ipa: 'haʊs', options: ['a', 'b', 'c', 'd'] },
      }),
    );
    renderPlayer();
    await onChoiceCard();
    expect(screen.getByText('house')).toBeInTheDocument();
    expect(screen.getByText('noun')).toBeInTheDocument();
    const ipa = screen.getByText('/haʊs/');
    expect(ipa).toHaveAttribute('lang', 'en');
    const tag = ipa.closest('[data-ipa]') as HTMLElement;
    expect(tag).toHaveTextContent('US pronunciationUS/haʊs/');
    expect(screen.getByText('US pronunciation')).toHaveClass('sr-only');
  });

  it('cloze shows only the English sentence with an empty gap before the answer', async () => {
    nextVocabCardAction.mockResolvedValueOnce(
      served({
        ...base,
        vocabRef: 'ref-1',
        card: {
          mode: 'cloze',
          sentence: 'Their ___ is old.',
          options: ['horse', 'house', 'mouse', 'hose'],
        },
      }),
    );
    renderPlayer();
    await onChoiceCard();
    const prompt = document.getElementById('vocab-prompt') as HTMLElement;
    expect(prompt.textContent).toMatch(/^Their\s+is old\.$/);
    expect(prompt.textContent).not.toContain('___');
    key('1');
    expect(prompt.textContent).not.toContain('horse');
    expect(screen.queryByText('Их дом старый.')).toBeNull();
    key('Enter');
    await onFeedback();
    expect(prompt.textContent).toContain('house');
    expect(screen.getByText('Их дом старый.')).toBeInTheDocument();
  });

  it('0 is "I don’t know"', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    submitVocabAttemptAction.mockResolvedValueOnce(
      answered({ verdict: 'dontKnow', chosenIndex: null, review: { kind: 'backSoon' } }),
    );
    renderPlayer();
    await onChoiceCard();
    key('0');
    await onFeedback();
    expect(lastSubmit().answer).toEqual({ type: 'dontKnow' });
    expect(screen.getByText('Back soon')).toBeInTheDocument();
  });

  it('a double click on Check sends once', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    renderPlayer();
    await onChoiceCard();
    key('2');
    const check = screen.getByRole('button', { name: /^Check/ });
    act(() => {
      fireEvent.click(check);
      fireEvent.click(check);
    });
    await onFeedback();
    expect(submitVocabAttemptAction).toHaveBeenCalledTimes(1);
  });
});

describe('recall modes', () => {
  it('typing in the answer field never triggers a shortcut; Enter sends the text', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(fullRecall('ref-1')));
    renderPlayer();
    const field = await onTextCard();
    for (const k of ['k', 'h', '0', '1']) key(k, field);
    expect(startVocabProofAction).not.toHaveBeenCalled();
    expect(submitVocabAttemptAction).not.toHaveBeenCalled();
    expect(document.querySelector('[data-hint]')).toBeNull();

    fireEvent.change(field, { target: { value: 'house' } });
    key('Enter', field);
    await onFeedback();
    expect(lastSubmit()).toMatchObject({
      answer: { type: 'text', value: 'house' },
      hinted: false,
    });
  });

  it('H shows the first-letter mask and marks the answer hinted', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(fullRecall('ref-1')));
    renderPlayer();
    const field = await onTextCard();
    act(() => field.blur());
    key('h');
    expect(document.querySelector('[data-hint]')).toHaveTextContent('h____');
    fireEvent.change(field, { target: { value: 'house' } });
    key('Enter', field);
    await onFeedback();
    expect(lastSubmit().hinted).toBe(true);
  });

  it('a synonym asks again on the same card, keeping the attempt key and focus', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(fullRecall('ref-1')));
    submitVocabAttemptAction.mockResolvedValueOnce({
      ok: true,
      value: { status: 'synonym_retry' },
    });
    renderPlayer();
    const field = await onTextCard();
    fireEvent.change(field, { target: { value: 'home' } });
    key('Enter', field);

    expect(await screen.findByText(p.synonym)).toBeInTheDocument();
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveValue('');
    const firstKey = lastSubmit().attemptKey;

    fireEvent.change(field, { target: { value: 'house' } });
    key('Enter', field);
    await onFeedback();
    expect(submitVocabAttemptAction).toHaveBeenCalledTimes(2);
    expect(lastSubmit()).toMatchObject({
      attemptKey: firstKey,
      answer: { type: 'text', value: 'house' },
    });
  });
});

describe('"I know this word" triage', () => {
  it('K swaps in the proof card with a new attempt key; a passed proof is marked', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(fullRecall('ref-1', { canProve: true })));
    startVocabProofAction.mockResolvedValueOnce({ ok: true, value: proofCard('ref-proof') });
    submitVocabAttemptAction.mockResolvedValueOnce(answered({ proven: true }));
    renderPlayer();
    const field = await onTextCard();
    act(() => field.blur());
    key('k');

    expect(await screen.findByText(p.proofBadge)).toBeInTheDocument();
    expect(startVocabProofAction).toHaveBeenCalledExactlyOnceWith({ vocabRef: 'ref-1' });
    expect(screen.getByText(p.proofInstruction)).toBeInTheDocument();
    expect(document.querySelector('[data-cue]')).toHaveTextContent('h____');
    // No hint and no second "I know" in a proof.
    expect(screen.queryByRole('button', { name: /^Hint/ })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(`^${p.know}`) })).toBeNull();

    const proofField = await onTextCard();
    act(() => proofField.blur());
    key('h');
    expect(document.querySelector('[data-hint]')).toBeNull();
    fireEvent.change(proofField, { target: { value: 'house' } });
    key('Enter', proofField);
    await onFeedback();

    expect(submitVocabAttemptAction).toHaveBeenCalledTimes(1);
    expect(lastSubmit()).toMatchObject({ vocabRef: 'ref-proof', hinted: false });
    expect(screen.getByText(p.proven)).toBeInTheDocument();
  });

  it('the proof card gets its own attempt key, not the first card’s', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1', { canProve: true })));
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-2', { canProve: true })));
    startVocabProofAction.mockResolvedValueOnce({ ok: true, value: proofCard('ref-proof') });
    renderPlayer();
    await onChoiceCard();
    key('2');
    key('Enter');
    await onFeedback();
    const firstKey = lastSubmit().attemptKey;
    key('Enter');
    await onChoiceCard();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${p.know}`) }));
    const field = await onTextCard();
    fireEvent.change(field, { target: { value: 'house' } });
    key('Enter', field);
    await onFeedback();
    expect(lastSubmit().attemptKey).toMatch(UUID);
    expect(lastSubmit().attemptKey).not.toBe(firstKey);
  });

  it('a proof card never offers a hint or a second proof, whatever the payload says', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(fullRecall('ref-1', { canProve: true })));
    startVocabProofAction.mockResolvedValueOnce({
      ok: true,
      value: proofCard('ref-proof', { hint: 'h____', canProve: true }),
    });
    renderPlayer();
    const field = await onTextCard();
    act(() => field.blur());
    key('k');
    expect(await screen.findByText(p.proofBadge)).toBeInTheDocument();
    const proofField = await onTextCard();
    act(() => proofField.blur());
    key('h');
    key('k');
    expect(document.querySelector('[data-hint]')).toBeNull();
    expect(startVocabProofAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^Hint/ })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(`^${p.know}`) })).toBeNull();
  });

  it('is not offered on a word that cannot be proven', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    renderPlayer();
    await onChoiceCard();
    expect(screen.queryByRole('button', { name: new RegExp(`^${p.know}`) })).toBeNull();
    key('k');
    expect(startVocabProofAction).not.toHaveBeenCalled();
  });

  it('a lost proof start offers Retry, focused, which asks again', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1', { canProve: true })));
    startVocabProofAction.mockRejectedValueOnce(new Error('offline'));
    startVocabProofAction.mockResolvedValueOnce({ ok: true, value: proofCard('ref-proof') });
    renderPlayer();
    await onChoiceCard();
    key('k');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(p.proofFailed);
    const retry = within(alert).getByRole('button', { name: 'Retry' });
    await waitFor(() => expect(retry).toHaveFocus());
    fireEvent.click(retry);
    expect(await screen.findByText(p.proofBadge)).toBeInTheDocument();
    expect(startVocabProofAction).toHaveBeenCalledTimes(2);
    expect(startVocabProofAction).toHaveBeenLastCalledWith({ vocabRef: 'ref-1' });
  });
});

describe('lost and stale answers', () => {
  it('a lost answer offers Retry, focused, which resends the same request', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    submitVocabAttemptAction.mockRejectedValueOnce(new Error('offline'));
    renderPlayer();
    await onChoiceCard();
    key('2');
    key('Enter');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en.learning.player.sendFailed);
    const retry = within(alert).getByRole('button', { name: 'Retry' });
    await waitFor(() => expect(retry).toHaveFocus());
    const first = lastSubmit();

    fireEvent.click(retry);
    await onFeedback();
    expect(submitVocabAttemptAction).toHaveBeenCalledTimes(2);
    expect(lastSubmit()).toEqual(first);
  });

  it('a lost next card offers Retry from the feedback', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    nextVocabCardAction.mockRejectedValueOnce(new Error('offline'));
    renderPlayer();
    await onChoiceCard();
    key('2');
    key('Enter');
    await onFeedback();
    key('Enter');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(p.nextFailed);
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await onChoiceCard();
    expect(nextVocabCardAction).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a stale card moves on to the next one and says why', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    submitVocabAttemptAction.mockResolvedValueOnce({ ok: true, value: { status: 'stale' } });
    renderPlayer();
    await onChoiceCard();
    key('2');
    key('Enter');
    expect(await screen.findByText(p.stale)).toBeInTheDocument();
    await waitFor(() => expect(nextVocabCardAction).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('session', () => {
  it(`ends after ${VOCAB_SESSION_LENGTH} cards with a summary and another session`, async () => {
    let n = 0;
    nextVocabCardAction.mockImplementation(async () => served(l1ToEn(`ref-${++n}`)));
    submitVocabAttemptAction.mockImplementation(async () =>
      answered(
        n === 2 ? { verdict: 'incorrect', chosenIndex: 0 } : n === 3 ? { proven: true } : {},
      ),
    );
    renderPlayer();
    for (let i = 0; i < VOCAB_SESSION_LENGTH; i++) {
      await onChoiceCard();
      key('2');
      key('Enter');
      await onFeedback();
      key('Enter');
    }
    expect(await screen.findByRole('heading', { name: p.done.title })).toBeInTheDocument();
    expect(screen.getByText('You answered 15 words.')).toBeInTheDocument();
    const tally = (k: string) => document.querySelector(`[data-tally="${k}"] dd`)?.textContent;
    expect([tally('correct'), tally('again'), tally('proven')]).toEqual(['14', '1', '1']);
    expect(nextVocabCardAction).toHaveBeenCalledTimes(VOCAB_SESSION_LENGTH);

    fireEvent.click(screen.getByRole('button', { name: p.done.again }));
    await onChoiceCard();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('Esc pauses back to the overview', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    renderPlayer();
    await onChoiceCard();
    key('Escape');
    expect(push).toHaveBeenCalledWith('/words');
  });

  it('modifier chords are left to the browser', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    renderPlayer();
    await onChoiceCard();
    act(() => {
      fireEvent.keyDown(window, { ...us('2'), metaKey: true });
    });
    expect(screen.getByRole('button', { name: /house/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports an issue about this card by its vocabRef', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    renderPlayer();
    await onChoiceCard();
    fireEvent.click(screen.getByRole('button', { name: en.feedback.reportIssue }));
    expect(screen.getByTestId('report-dialog')).toHaveAttribute('data-vocab-ref', 'ref-1');
  });

  it('never shows an FSRS or BKT number', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    const { container } = renderPlayer();
    await onChoiceCard();
    key('2');
    key('Enter');
    await onFeedback();
    expect(container.textContent).not.toMatch(/stability|difficulty|pKnown/i);
  });
});

describe('the intro card (B6.5)', () => {
  const introWord = {
    word: 'house',
    pos: 'NOUN',
    ipa: null,
    meaning: { kind: 'gloss', text: 'дом' },
    example: { sentence: 'Their house is old.', translation: 'Их дом старый.' },
    collocations: ['build a house', 'house party'],
  } as const;
  const intro = (vocabRef = 'intro-1', over = {}) => ({
    ok: true,
    value: {
      status: 'intro',
      vocabRef,
      word: { ...introWord, ...over },
      slug: 'house-noun',
      remainingNew: 5,
    },
  });
  const onIntro = async () => {
    await screen.findByRole('heading', { name: 'house' });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Continue/ })).toHaveFocus());
  };
  const afterIntroCalls = () =>
    nextVocabCardAction.mock.calls.filter(([input]) => input.afterIntro !== undefined);

  it('shows the word as the heading, its meaning, example and collocations; no IPA when null; focus on Continue', async () => {
    nextVocabCardAction.mockResolvedValueOnce(intro());
    renderPlayer();
    await onIntro();
    expect(screen.getByRole('heading', { name: 'house' })).toHaveAttribute('lang', 'en');
    expect(screen.getByText('дом')).toBeVisible();
    expect(screen.getByText('Their house is old.')).toBeVisible();
    expect(screen.getByText('build a house')).toBeVisible();
    expect(document.querySelector('[data-ipa]')).toBeNull();
    expect(document.querySelector('[data-player-option]')).toBeNull();
  });

  it('Continue (a click, Enter or Space) asks for the word’s first question with the intro ref', async () => {
    for (const how of ['click', 'Enter', ' '] as const) {
      nextVocabCardAction.mockReset();
      nextVocabCardAction.mockResolvedValueOnce(intro('intro-x'));
      nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('q-1')));
      const { unmount } = renderPlayer();
      await onIntro();
      if (how === 'click') fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
      else key(how, document.body);
      await onChoiceCard();
      expect(afterIntroCalls()).toEqual([
        [expect.objectContaining({ afterIntro: 'intro-x', recentVocabRefs: [] })],
      ]);
      unmount();
    }
  });

  it.each([
    ['K', () => key('k', document.body)],
    [
      'the button',
      () => fireEvent.click(screen.getByRole('button', { name: /^I know this word/ })),
    ],
  ])('%s ("I know this word") opens the proof of the intro’s word, not its question (B6.6)', async (_, press) => {
    nextVocabCardAction.mockResolvedValueOnce(intro('intro-k'));
    startVocabProofAction.mockResolvedValueOnce({ ok: true, value: proofCard('ref-proof') });
    renderPlayer();
    await onIntro();
    press();
    await onTextCard();
    expect(startVocabProofAction).toHaveBeenCalledExactlyOnceWith({ vocabRef: 'intro-k' });
    expect(afterIntroCalls()).toHaveLength(0);
    expect(screen.getByText(p.proofBadge)).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'house' })).toBeNull();
  });

  it('a proof from the intro joins the recent refs: a failed one is not served straight back', async () => {
    nextVocabCardAction.mockResolvedValueOnce(intro('intro-k'));
    startVocabProofAction.mockResolvedValueOnce({ ok: true, value: proofCard('ref-proof') });
    submitVocabAttemptAction.mockResolvedValueOnce(answered({ verdict: 'incorrect' }));
    renderPlayer();
    await onIntro();
    key('k', document.body);
    const field = await onTextCard();
    fireEvent.change(field, { target: { value: 'hose' } });
    key('Enter', field);
    await onFeedback();
    key('Enter');
    await waitFor(() => expect(nextVocabCardAction).toHaveBeenCalledTimes(2));
    expect(nextVocabCardAction.mock.lastCall?.[0]).toMatchObject({
      recentVocabRefs: ['ref-proof'],
    });
  });

  it('a lost proof start keeps the intro and offers Retry, which asks for the proof again', async () => {
    nextVocabCardAction.mockResolvedValueOnce(intro('intro-k'));
    startVocabProofAction.mockRejectedValueOnce(new Error('offline'));
    startVocabProofAction.mockResolvedValueOnce({ ok: true, value: proofCard('ref-proof') });
    renderPlayer();
    await onIntro();
    key('k', document.body);
    const retry = await screen.findByRole('button', { name: /^Retry/ });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(screen.getByText(p.proofFailed)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'house' })).toBeVisible();
    fireEvent.click(retry);
    await onTextCard();
    expect(startVocabProofAction.mock.calls).toEqual([
      [{ vocabRef: 'intro-k' }],
      [{ vocabRef: 'intro-k' }],
    ]);
  });

  it('Continue after a lost proof start clears its Retry and opens the question', async () => {
    nextVocabCardAction.mockResolvedValueOnce(intro('intro-k'));
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('q-1')));
    startVocabProofAction.mockRejectedValueOnce(new Error('offline'));
    renderPlayer();
    await onIntro();
    key('k', document.body);
    await screen.findByRole('button', { name: /^Retry/ });
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    await onChoiceCard();
    expect(screen.queryByRole('button', { name: /^Retry/ })).toBeNull();
    expect(afterIntroCalls()).toHaveLength(1);
  });

  it('a word answered since (another tab) moves on to the next card', async () => {
    nextVocabCardAction.mockResolvedValueOnce(intro('intro-k'));
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('q-1')));
    startVocabProofAction.mockResolvedValueOnce({ ok: true, value: { status: 'stale' } });
    renderPlayer();
    await onIntro();
    key('k', document.body);
    await onChoiceCard();
    expect(screen.getByText(p.stale)).toBeVisible();
    expect(nextVocabCardAction.mock.lastCall?.[0]).not.toHaveProperty('afterIntro');
  });

  it.each([
    ['Meta', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Shift', { shiftKey: true }],
    ['an auto-repeat', { repeat: true }],
    ['an IME composition', { isComposing: true }],
  ])('K with %s: no call', async (_, over) => {
    nextVocabCardAction.mockResolvedValueOnce(intro());
    renderPlayer();
    await onIntro();
    act(() => {
      fireEvent.keyDown(document.body, { ...us('k'), ...over });
    });
    expect(afterIntroCalls()).toHaveLength(0);
    expect(startVocabProofAction).not.toHaveBeenCalled();
  });

  it.each([
    ['an input', '<input type="text">'],
    ['a textarea', '<textarea></textarea>'],
    ['a contenteditable', '<div contenteditable="true" tabindex="0"></div>'],
  ])('K with focus in %s: no call', async (_, html) => {
    nextVocabCardAction.mockResolvedValueOnce(intro());
    renderPlayer();
    await onIntro();
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const field = host.firstElementChild as HTMLElement;
    act(() => {
      fireEvent.keyDown(field, us('k'));
    });
    expect(afterIntroCalls()).toHaveLength(0);
    expect(startVocabProofAction).not.toHaveBeenCalled();
    host.remove();
  });

  it('one request in flight: a second Continue / K before the reply sends nothing', async () => {
    let reply: (v: unknown) => void = () => {};
    nextVocabCardAction.mockResolvedValueOnce(intro());
    nextVocabCardAction.mockImplementationOnce(() => new Promise((r) => (reply = r)));
    renderPlayer();
    await onIntro();
    // All in one tick: no re-render between them, so only the ref set before
    // the call can stop the rest (phase state would still read 'intro').
    act(() => {
      fireEvent.keyDown(document.body, us('Enter'));
      fireEvent.keyDown(document.body, us('k'));
      fireEvent.keyDown(document.body, us('Enter'));
      fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    });
    expect(afterIntroCalls()).toHaveLength(1);
    expect(startVocabProofAction).not.toHaveBeenCalled();
    await act(async () => reply(served(l1ToEn('q-1'))));
    await onChoiceCard();
  });

  it('one request in flight: K first, then Continue / K before the reply sends nothing', async () => {
    let reply: (v: unknown) => void = () => {};
    nextVocabCardAction.mockResolvedValueOnce(intro());
    startVocabProofAction.mockImplementationOnce(() => new Promise((r) => (reply = r)));
    renderPlayer();
    await onIntro();
    act(() => {
      fireEvent.keyDown(document.body, us('k'));
      fireEvent.keyDown(document.body, us('k'));
      fireEvent.keyDown(document.body, us('Enter'));
      fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    });
    expect(startVocabProofAction).toHaveBeenCalledTimes(1);
    expect(afterIntroCalls()).toHaveLength(0);
    await act(async () => reply({ ok: true, value: proofCard('ref-proof') }));
    await onTextCard();
  });

  it('a lost reply keeps the intro and offers Retry, which asks again with the intro ref', async () => {
    nextVocabCardAction.mockResolvedValueOnce(intro('intro-r'));
    nextVocabCardAction.mockRejectedValueOnce(new Error('network'));
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('q-1')));
    renderPlayer();
    await onIntro();
    key('Enter', document.body);
    const retry = await screen.findByRole('button', { name: /^Retry/ });
    expect(screen.getByRole('heading', { name: 'house' })).toBeVisible();
    fireEvent.click(retry);
    await onChoiceCard();
    expect(afterIntroCalls().map(([input]) => input.afterIntro)).toEqual(['intro-r', 'intro-r']);
  });

  it('the intro ref is not a card: it never joins the recent refs', async () => {
    nextVocabCardAction.mockResolvedValueOnce(intro('intro-1'));
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('q-1')));
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('q-2')));
    renderPlayer();
    await onIntro();
    key('Enter', document.body);
    await onChoiceCard();
    key('2');
    key('Enter');
    await onFeedback();
    key('Enter');
    await waitFor(() => expect(nextVocabCardAction).toHaveBeenCalledTimes(3));
    expect(nextVocabCardAction.mock.lastCall?.[0]).toMatchObject({ recentVocabRefs: ['q-1'] });
    expect(nextVocabCardAction.mock.lastCall?.[0]).not.toHaveProperty('afterIntro');
  });

  it('"Add to list…" names the word by slug; Escape in the menu closes it, never pauses; K in its field is typing', async () => {
    wordListMenuAction.mockResolvedValue({
      ok: true,
      value: { lists: [{ id: 'l1', title: 'Trip', count: 2, hasWord: false }], atLimit: false },
    });
    nextVocabCardAction.mockResolvedValueOnce(intro());
    renderPlayer();
    await onIntro();
    const toggle = screen.getByRole('button', { name: 'Add “house” to a list' });
    fireEvent.click(toggle);
    expect(await screen.findByRole('button', { name: 'Add to “Trip”' })).toBeVisible();
    expect(wordListMenuAction).toHaveBeenCalledWith({ slug: 'house-noun' });
    const field = screen.getByRole('textbox', { name: 'New list' });
    act(() => {
      fireEvent.keyDown(field, us('k'));
    });
    expect(startVocabProofAction).not.toHaveBeenCalled();
    key('Escape', field);
    expect(screen.queryByRole('button', { name: 'Add to “Trip”' })).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(push).not.toHaveBeenCalled();
    // Closed, Escape is the player's again: pause.
    key('Escape', document.body);
    expect(push).toHaveBeenCalledWith('/words');
  });

  it('an intro without a slug offers no list menu', async () => {
    nextVocabCardAction.mockResolvedValueOnce({
      ok: true,
      value: { status: 'intro', vocabRef: 'i', word: introWord, slug: null, remainingNew: 5 },
    });
    renderPlayer();
    await onIntro();
    expect(screen.queryByRole('button', { name: /to a list$/ })).toBeNull();
  });
});

describe('"I know" on a word page (B6.6, `?prove=<slug>`)', () => {
  it('opens the session on that word’s proof — no card is selected first', async () => {
    startWordProofAction.mockResolvedValueOnce({ ok: true, value: proofCard('ref-proof') });
    renderPlayer({ kind: 'collection', key: 'clothes' }, 'house-noun');
    await onTextCard();
    expect(startWordProofAction).toHaveBeenCalledExactlyOnceWith({ slug: 'house-noun' });
    expect(nextVocabCardAction).not.toHaveBeenCalled();
    expect(screen.getByText(p.proofBadge)).toBeVisible();
  });

  it('after the proof the session goes on in its scope, the proof among the recent refs', async () => {
    startWordProofAction.mockResolvedValueOnce({ ok: true, value: proofCard('ref-proof') });
    renderPlayer({ kind: 'collection', key: 'clothes' }, 'house-noun');
    const field = await onTextCard();
    fireEvent.change(field, { target: { value: 'house' } });
    key('Enter', field);
    await onFeedback();
    key('Enter');
    await waitFor(() => expect(nextVocabCardAction).toHaveBeenCalledTimes(1));
    expect(nextVocabCardAction.mock.lastCall?.[0]).toMatchObject({
      scope: { kind: 'collection', key: 'clothes' },
      recentVocabRefs: ['ref-proof'],
    });
  });

  it.each([
    ['refused (unknown or unpublished word)', { ok: false, error: 'NOT_FOUND' }],
    ['stale (being learned since)', { ok: true, value: { status: 'stale' } }],
  ])('%s: the session simply starts, without a notice', async (_, reply) => {
    startWordProofAction.mockResolvedValueOnce(reply);
    renderPlayer(undefined, 'house-noun');
    await onChoiceCard();
    expect(nextVocabCardAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(p.stale)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a lost reply offers Retry (no loading line), which asks for the same word again', async () => {
    startWordProofAction.mockRejectedValueOnce(new Error('offline'));
    startWordProofAction.mockResolvedValueOnce({ ok: true, value: proofCard('ref-proof') });
    renderPlayer(undefined, 'house-noun');
    const retry = await screen.findByRole('button', { name: /^Retry/ });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(screen.queryByText(p.loading)).toBeNull();
    fireEvent.click(retry);
    await onTextCard();
    expect(startWordProofAction.mock.calls).toEqual([
      [{ slug: 'house-noun' }],
      [{ slug: 'house-noun' }],
    ]);
  });
});

describe('deployment skew (V2-15)', () => {
  // What Next 16.2 throws when the server does not know the action's id.
  const unknownAction = () =>
    new UnrecognizedActionError('Server Action "7f00aa" was not found on the server.');

  it('an unknown action reloads the page once; failing again after the reload shows Retry', async () => {
    nextVocabCardAction.mockRejectedValueOnce(unknownAction());
    renderPlayer();
    await waitFor(() => expect(hardReload).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // The reloaded page (same tab, same sessionStorage), still out of step.
    cleanup();
    nextVocabCardAction.mockRejectedValueOnce(unknownAction());
    renderPlayer();
    expect(await screen.findByRole('alert')).toHaveTextContent(p.nextFailed);
    expect(hardReload).toHaveBeenCalledTimes(1);
  });

  it('an answer sent to an unknown action reloads once too, before anything shows', async () => {
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    submitVocabAttemptAction.mockRejectedValueOnce(unknownAction());
    renderPlayer();
    await onChoiceCard();
    await key('1');
    await key('Enter');
    await waitFor(() => expect(hardReload).toHaveBeenCalledTimes(1));
  });

  it('a successful call clears the guard, so the next deploy may reload again', async () => {
    sessionStorage.setItem('englishlearn:action-skew-reload', String(Date.now()));
    nextVocabCardAction.mockResolvedValueOnce(served(l1ToEn('ref-1')));
    renderPlayer();
    await onChoiceCard();
    expect(sessionStorage.getItem('englishlearn:action-skew-reload')).toBeNull();
  });
});
