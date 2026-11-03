'use client';

import { PRACTICE_GAP } from '@englishlearn/db/schemas';
import type { VocabCardView, VocabMode } from '@englishlearn/learner-model';
import { cn, KeyHint } from '@englishlearn/ui';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType, RefObject } from 'react';
import type { VocabCardPayload, VocabFeedback } from '@/lib/vocab-session';

/**
 * The player's renderer registry (B6.3), keyed by variant id like the
 * engine's variant registry: each variant draws its prompt block and its
 * answer block. The player owns state, keys and feedback; a new variant adds
 * one entry here. Keyboard handling is not part of a renderer.
 */

type ViewOf<M extends VocabMode> = Extract<VocabCardView, { mode: M }>;

export type PromptProps<M extends VocabMode> = {
  view: ViewOf<M>;
  card: VocabCardPayload;
  feedback: VocabFeedback | null;
};

export type AnswerProps<M extends VocabMode> = {
  view: ViewOf<M>;
  feedback: VocabFeedback | null;
  answered: boolean;
  disabled: boolean;
  selected: number | null;
  onSelect: (index: number) => void;
  text: string;
  onText: (text: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

export type VocabRenderer<M extends VocabMode> = {
  Prompt: ComponentType<PromptProps<M>>;
  Answer: ComponentType<AnswerProps<M>>;
};

export const VOCAB_RENDERERS: { readonly [M in VocabMode]: VocabRenderer<M> } = {
  en_to_l1: {
    Prompt: EnToL1Prompt,
    // The options are glosses in the learner's language.
    Answer: (props) => <ChoiceAnswer {...props} optionLang={undefined} />,
  },
  l1_to_en: {
    Prompt: ({ view }) => <GlossPrompt gloss={view.gloss} />,
    Answer: (props) => <ChoiceAnswer {...props} optionLang="en" />,
  },
  cloze: {
    Prompt: ({ view, feedback }) => (
      <p lang="en" className="font-content text-[1.5rem] leading-snug text-ink">
        <ClozeSentence
          sentence={view.sentence}
          fill={
            feedback?.correctIndex != null ? (view.options[feedback.correctIndex] ?? null) : null
          }
        />
      </p>
    ),
    Answer: (props) => <ChoiceAnswer {...props} optionLang="en" />,
  },
  cued_recall: {
    Prompt: ({ view }) => (
      <>
        <GlossPrompt gloss={view.gloss} />
        <p lang="en" className="font-mono text-lg tracking-widest text-ink-muted" data-cue="">
          {view.cue}
        </p>
      </>
    ),
    Answer: (props) => <TextAnswer {...props} />,
  },
  full_recall: {
    Prompt: ({ view }) => <GlossPrompt gloss={view.gloss} />,
    Answer: (props) => <TextAnswer {...props} />,
  },
};

function EnToL1Prompt({ view, card }: PromptProps<'en_to_l1'>) {
  const t = useTranslations('student.words.player');
  return (
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
  );
}

/** The renderer of a card's served variant, typed for its view. */
export function VocabCardPrompt(props: PromptProps<VocabMode>) {
  const { Prompt } = VOCAB_RENDERERS[props.view.mode] as VocabRenderer<VocabMode>;
  return <Prompt {...props} />;
}

export function VocabCardAnswer(props: AnswerProps<VocabMode>) {
  const { Answer } = VOCAB_RENDERERS[props.view.mode] as VocabRenderer<VocabMode>;
  return <Answer {...props} />;
}

function GlossPrompt({ gloss }: { gloss: string }) {
  return <p className="font-content text-[1.5rem] leading-snug text-ink">{gloss}</p>;
}

function ChoiceAnswer({
  view,
  feedback,
  disabled,
  selected,
  onSelect,
  optionLang,
}: AnswerProps<'en_to_l1' | 'l1_to_en' | 'cloze'> & { optionLang: 'en' | undefined }) {
  return (
    <ul className="flex flex-col gap-2">
      {view.options.map((option, index) => {
        const isCorrect = feedback?.correctIndex === index;
        const isWrongPick = feedback !== null && feedback.chosenIndex === index && !isCorrect;
        return (
          <li key={option}>
            <button
              type="button"
              data-player-option=""
              aria-pressed={selected === index}
              disabled={disabled}
              onClick={() => onSelect(index)}
              className={cn(
                'flex w-full items-center gap-3 rounded-control border bg-surface px-4 py-3 text-left shadow-soft transition-colors duration-(--duration-fast) ease-standard',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                selected === index && !feedback
                  ? 'border-accent bg-surface-2 ring-1 ring-accent'
                  : 'border-line',
                !disabled && 'hover:bg-surface-2',
                isCorrect && 'border-feedback-correct',
                isWrongPick && 'border-feedback-incorrect',
              )}
            >
              <KeyHint>{String(index + 1)}</KeyHint>
              <span lang={optionLang} className="flex-1 font-content text-lg text-ink">
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
  );
}

function TextAnswer({
  answered,
  disabled,
  text,
  onText,
  inputRef,
}: AnswerProps<'cued_recall' | 'full_recall'>) {
  const t = useTranslations('student.words.player');
  if (answered) return null;
  return (
    <input
      ref={inputRef}
      value={text}
      onChange={(e) => onText(e.target.value)}
      disabled={disabled}
      aria-label={t('answerLabel')}
      lang="en"
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      className="h-12 rounded-control border border-line bg-surface px-4 font-content text-xl text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
    />
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
        {fill ?? ' '}
      </span>
      {after}
    </>
  );
}
