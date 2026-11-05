'use client';

import { buttonVariants, cn, Input } from '@englishlearn/ui';
import { Check, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { callServerAction } from '@/lib/action-skew';
import type { WordSearchResult } from '@/lib/word-lists';
import {
  addWordsToListAction,
  searchWordsAction,
  type WordListActionError,
} from '../../../actions/word-lists';

/** Wait this long after the last keystroke before searching. */
export const SEARCH_DEBOUNCE_MS = 250;

type Search =
  | { phase: 'idle' }
  | { phase: 'searching' }
  | { phase: 'done'; results: WordSearchResult[] }
  | { phase: 'failed' };

const quiet = buttonVariants({ variant: 'secondary', size: 'sm' });

/**
 * "Add words from the catalogue" on a list page (B6.7): a debounced search
 * (≥ 2 characters) over PUBLISHED words — headword or variant prefix, gloss
 * substring in the learner's language — and one action per word to add it.
 * A word already in the list shows "In list". Only the latest query's
 * answer is shown; words go by slug.
 */
export function WordSearch({
  listId,
  minChars,
  onAdded,
  errorText,
}: {
  listId: string;
  /** SEARCH_MIN_CHARS, from the server (learner-model stays out of the client bundle). */
  minChars: number;
  onAdded: (word: WordSearchResult) => void;
  errorText: (error: WordListActionError | null) => string;
}) {
  const t = useTranslations('student.words.search');
  const tp = useTranslations('student.words.player');
  const id = useId();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<Search>({ phase: 'idle' });
  const [failure, setFailure] = useState<{ slug: string; text: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const latest = useRef(0);
  const adding = useRef(new Set<string>());

  useEffect(() => {
    const q = query.trim();
    const ticket = ++latest.current;
    if ([...q].length < minChars) {
      setSearch({ phase: 'idle' });
      return;
    }
    setSearch({ phase: 'searching' });
    const timer = setTimeout(async () => {
      try {
        const res = await callServerAction(() => searchWordsAction({ query: q, listId }));
        if (ticket !== latest.current) return;
        setSearch(res.ok ? { phase: 'done', results: res.value.results } : { phase: 'failed' });
      } catch {
        if (ticket === latest.current) setSearch({ phase: 'failed' });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, listId, minChars]);

  const markInList = (slug: string) =>
    setSearch((s) =>
      s.phase === 'done'
        ? { ...s, results: s.results.map((r) => (r.slug === slug ? { ...r, inList: true } : r)) }
        : s,
    );

  const add = async (word: WordSearchResult) => {
    if (adding.current.has(word.slug)) return;
    adding.current.add(word.slug);
    setFailure(null);
    let error: WordListActionError | null = null;
    try {
      const res = await callServerAction(() =>
        addWordsToListAction({ listId, slugs: [word.slug] }),
      );
      if (!res.ok) error = res.error;
    } catch {
      error = 'UNAVAILABLE';
    }
    adding.current.delete(word.slug);
    if (error !== null) {
      setFailure({ slug: word.slug, text: errorText(error) });
      return;
    }
    markInList(word.slug);
    setAnnouncement(t('added', { word: word.headword }));
    onAdded(word);
  };

  return (
    <section aria-labelledby={`${id}-label`} className="flex flex-col gap-3" data-word-search="">
      <label id={`${id}-label`} htmlFor={`${id}-q`} className="font-content text-xl text-ink">
        {t('label')}
      </label>
      <Input
        id={`${id}-q`}
        type="search"
        value={query}
        maxLength={80}
        autoComplete="off"
        placeholder={t('placeholder')}
        aria-describedby={`${id}-state`}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p id={`${id}-state`} aria-live="polite" className="text-sm text-ink-muted">
        {search.phase === 'idle'
          ? t('hint')
          : search.phase === 'searching'
            ? t('searching')
            : search.phase === 'failed'
              ? errorText(null)
              : search.results.length === 0
                ? t('none')
                : t('results', { count: search.results.length })}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {search.phase === 'done' && search.results.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
          {search.results.map((word) => (
            <li
              key={word.slug}
              data-result={word.slug}
              className="flex flex-col gap-2 bg-surface-2 px-4 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span lang="en" className="font-medium text-ink">
                    {word.headword}
                  </span>
                  <span className="text-xs text-ink-muted">{tp('pos', { pos: word.pos })}</span>
                  <span className="font-mono text-xs text-ink-muted">{word.level}</span>
                  <span className="text-sm text-ink-muted">{word.gloss}</span>
                </p>
                {word.inList ? (
                  <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
                    <Check aria-hidden="true" className="size-4" />
                    {t('inList')}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={quiet}
                    aria-label={t('addLabel', { word: word.headword })}
                    onClick={() => void add(word)}
                  >
                    <Plus aria-hidden="true" className="mr-1 size-4" />
                    {t('add')}
                  </button>
                )}
              </div>
              {failure?.slug === word.slug ? (
                <p role="alert" className={cn('text-sm text-feedback-incorrect')}>
                  {failure.text}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
