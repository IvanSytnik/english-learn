'use client';

import { PRACTICE_GAP } from '@englishlearn/db/schemas';
import type {
  ChoiceVariantId,
  VocabCardView,
  VocabIntroView,
  VocabVariantId,
} from '@englishlearn/learner-model';
import { cn, KeyHint } from '@englishlearn/ui';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode, RefObject } from 'react';
import type { VocabCardPayload, VocabFeedback } from '@/lib/vocab-session';

/**
 * The player's renderer registry (B6.3), keyed by variant id like the
 * engine's variant registry: each variant draws its prompt block and its
 * answer block. The player owns state, keys and feedback; a new variant adds
 * one entry here. Keyboard handling is not part of a renderer.
 */

type ViewOf<M extends VocabVariantId> = Extract<VocabCardView, { mode: M }>;

export type PromptProps<M extends VocabVariantId> = {
  view: ViewOf<M>;
  card: VocabCardPayload;
  feedback: VocabFeedback | null;
};

export type AnswerProps<M extends VocabVariantId> = {
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

export type VocabRenderer<M extends VocabVariantId> = {
  Prompt: ComponentType<PromptProps<M>>;
  Answer: ComponentType<AnswerProps<M>>;
};

export const VOCAB_RENDERERS: { readonly [M in VocabVariantId]: VocabRenderer<M> } = {
  en_to_l1: {
    Prompt: EnToL1Prompt,
    // The options are glosses in the learner's language.
    Answer: (props) => <ChoiceAnswer {...props} optionLang={undefined} />,
  },
  l1_to_en: {
    Prompt: ({ view }) => <GlossPrompt gloss={view.gloss} />,
    Answer: (props) => <ChoiceAnswer {...props} optionLang="en" />,
  },
  definition_to_en: {
    // The English definition (B1+, B6.5): choose the English word.
    Prompt: ({ view }) => (
      <p lang="en" className="font-content text-[1.5rem] leading-snug text-ink" data-definition="">
        {view.definition}
      </p>
    ),
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
  collocation: {
    // A collocation with a gap (B1+, B6.5), filled in once the answer is in.
    Prompt: ({ view, feedback }) => (
      <p lang="en" className="font-content text-[1.5rem] leading-snug text-ink" data-collocation="">
        <ClozeSentence
          sentence={view.phrase}
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

/**
 * A CMUdict transcription (General American, B6.4a) with its region tag:
 * "US /ˈæpəl/". Screen readers hear "US pronunciation" instead of the tag.
 */
export function IpaTag({ ipa, className }: { ipa: string; className?: string }) {
  const t = useTranslations('student.words.player');
  return (
    <span className={className} data-ipa="">
      <span className="sr-only">{t('ipaLabel')}</span>
      <span aria-hidden="true" className="mr-1 text-xs font-medium tracking-wide">
        {t('ipaRegion')}
      </span>
      <span lang="en" className="font-mono">
        /{ipa}/
      </span>
    </span>
  );
}

function EnToL1Prompt({ view, card }: PromptProps<'en_to_l1'>) {
  const t = useTranslations('student.words.player');
  return (
    <>
      <p lang="en" className="font-content text-[2rem] leading-tight text-ink">
        {view.word}
      </p>
      <p className="text-sm text-ink-muted">
        <span>{t('pos', { pos: card.pos })}</span>
        {view.ipa ? <IpaTag ipa={view.ipa} className="ml-2" /> : null}
      </p>
    </>
  );
}

/**
 * A new word's intro card (B6.5): the word as the heading, its part of
 * speech and IPA (none when null — there is no audio slot before B6.4b), the
 * meaning (gloss below B1, English definition from B1), one example with its
 * translation and up to two collocations. The actions are the player's: it
 * owns the request and the keys; focus starts on Continue.
 */
export function VocabIntroCard({ word, actions }: { word: VocabIntroView; actions: ReactNode }) {
  const t = useTranslations('student.words.player');
  const { meaning, example } = word;
  return (
    <section aria-labelledby="vocab-intro-word" className="flex flex-col gap-5" data-intro="">
      <p className="text-sm font-medium text-ink-muted">{t('intro.badge')}</p>
      <div className="flex flex-col gap-1">
        <h2
          id="vocab-intro-word"
          lang="en"
          className="font-content text-[2rem] leading-tight text-ink"
        >
          {word.word}
        </h2>
        <p className="text-sm text-ink-muted">
          <span>{t('pos', { pos: word.pos })}</span>
          {word.ipa ? <IpaTag ipa={word.ipa} className="ml-2" /> : null}
        </p>
      </div>
      <p
        lang={meaning.kind === 'definition' ? 'en' : undefined}
        className="font-content text-xl text-ink"
        data-meaning={meaning.kind}
      >
        {meaning.text}
      </p>
      {example ? (
        <div className="flex flex-col gap-1 border-l-2 border-line pl-3" data-intro-example="">
          <p lang="en" className="font-content text-lg text-ink">
            {example.sentence}
          </p>
          {example.translation ? (
            <p className="text-sm text-ink-muted">{example.translation}</p>
          ) : null}
        </div>
      ) : null}
      {word.collocations.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ink-muted">{t('intro.collocations')}</h3>
          <ul lang="en" className="flex flex-wrap gap-2" data-intro-collocations="">
            {word.collocations.map((c) => (
              <li
                key={c}
                className="rounded-control border border-line px-2 py-1 font-content text-ink"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {actions}
    </section>
  );
}

/** The renderer of a card's served variant, typed for its view. */
export function VocabCardPrompt(props: PromptProps<VocabVariantId>) {
  const { Prompt } = VOCAB_RENDERERS[props.view.mode] as VocabRenderer<VocabVariantId>;
  return <Prompt {...props} />;
}

export function VocabCardAnswer(props: AnswerProps<VocabVariantId>) {
  const { Answer } = VOCAB_RENDERERS[props.view.mode] as VocabRenderer<VocabVariantId>;
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
}: AnswerProps<ChoiceVariantId> & { optionLang: 'en' | undefined }) {
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
