'use client';

import { DAILY_VOCAB_LIMIT_MAX, DAILY_VOCAB_LIMIT_MIN } from '@englishlearn/db/schemas';
import { Button, Input } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useRef, useState, useTransition } from 'react';
import { updateDailyVocabLimitAction } from '../actions/vocab';

type Status = 'idle' | 'saved' | 'invalid' | 'failed';

/**
 * New words per day (1..50). Checked here for a quick message, again on the
 * server. A refused or lost save keeps the typed value and offers Retry,
 * which gets focus; a saved one asks the overview to refresh.
 */
export function DailyLimitForm({
  initial,
  onSaved,
}: {
  initial: number;
  onSaved: (limit: number) => void;
}) {
  const t = useTranslations('student.words.limit');
  const id = useId();
  const [value, setValue] = useState(String(initial));
  const [status, setStatus] = useState<Status>('idle');
  const [pending, startTransition] = useTransition();
  // Set synchronously before the action: a double submit must not send twice.
  const sending = useRef(false);
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (status === 'failed') retryRef.current?.focus();
  }, [status]);

  function save() {
    if (sending.current) return;
    const limit = Number(value);
    if (
      !/^\d+$/.test(value.trim()) ||
      limit < DAILY_VOCAB_LIMIT_MIN ||
      limit > DAILY_VOCAB_LIMIT_MAX
    ) {
      setStatus('invalid');
      return;
    }
    sending.current = true;
    setStatus('idle');
    startTransition(async () => {
      try {
        const res = await updateDailyVocabLimitAction({ dailyVocabLimit: limit });
        if (res.ok) {
          setStatus('saved');
          onSaved(res.value.dailyVocabLimit);
        } else {
          setStatus('failed');
        }
      } catch {
        // No reply: the value stays, and Retry sends it again.
        setStatus('failed');
      } finally {
        sending.current = false;
      }
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save();
  }

  const range = { min: DAILY_VOCAB_LIMIT_MIN, max: DAILY_VOCAB_LIMIT_MAX };
  return (
    // Our own localized message, not the browser's range tooltip.
    <form noValidate onSubmit={submit} className="flex flex-col gap-2" data-daily-limit-form="">
      <label htmlFor={`${id}-limit`} className="text-sm font-medium text-ink">
        {t('label')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${id}-limit`}
          type="number"
          inputMode="numeric"
          min={DAILY_VOCAB_LIMIT_MIN}
          max={DAILY_VOCAB_LIMIT_MAX}
          step={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus('idle');
          }}
          aria-describedby={`${id}-range`}
          aria-invalid={status === 'invalid' || undefined}
          className="w-24"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {t('save')}
        </Button>
      </div>
      <p id={`${id}-range`} className="text-xs text-ink-muted">
        {t('description', range)}
      </p>
      {status === 'saved' ? (
        <p role="status" className="text-sm text-ink">
          {t('saved')}
        </p>
      ) : null}
      {status === 'invalid' ? (
        <p role="alert" className="text-sm text-feedback-incorrect">
          {t('invalid', range)}
        </p>
      ) : null}
      {status === 'failed' ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-feedback-incorrect">{t('failed')}</span>
          <Button ref={retryRef} type="button" variant="ghost" size="sm" onClick={save}>
            {t('retry')}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
