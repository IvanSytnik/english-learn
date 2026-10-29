'use client';

import type { NativeLanguage } from '@englishlearn/db/schemas';
import { Button, cn } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState, useTransition } from 'react';
import { LANGUAGE_CHOICES } from '../_components/native-language-choices';
import { updateNativeLanguageAction } from './actions';

type Status = 'idle' | 'saved' | 'failed';

/**
 * Change the native language. Native radios in a fieldset named by the card
 * title; nothing is preselected when none was chosen (never guessed from the
 * interface language). Sent only on Save.
 */
export function LanguageForm({ initial }: { initial: NativeLanguage | null }) {
  const t = useTranslations('settings.language');
  const [selected, setSelected] = useState<NativeLanguage | null>(initial);
  const [status, setStatus] = useState<Status>('idle');
  const [pending, startTransition] = useTransition();
  // Set synchronously before the action: a double submit must not send twice.
  const sending = useRef(false);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === null || sending.current) return;
    sending.current = true;
    setStatus('idle');
    startTransition(async () => {
      try {
        const res = await updateNativeLanguageAction({ language: selected });
        setStatus(res.ok ? 'saved' : 'failed');
      } catch {
        // No reply: the choice stays, and Save tries again.
        setStatus('failed');
      } finally {
        sending.current = false;
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <p id="settings-language-why" className="text-sm text-ink-muted">
        {t('description')}
      </p>
      <fieldset
        aria-labelledby="settings-language-title"
        aria-describedby="settings-language-why"
        disabled={pending}
        className="flex flex-col gap-2"
      >
        {LANGUAGE_CHOICES.map(({ code, endonym }) => (
          <label
            key={code}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-control border bg-surface px-4 py-3 text-ink',
              selected === code ? 'border-accent ring-1 ring-accent' : 'border-line',
            )}
          >
            <input
              type="radio"
              name="nativeLanguage"
              value={code}
              checked={selected === code}
              onChange={() => {
                setSelected(code);
                setStatus('idle');
              }}
              className="size-4 accent-accent"
            />
            {endonym ? <span lang={code}>{endonym}</span> : <span>{t('other')}</span>}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || selected === null}>
          {t('saveButton')}
        </Button>
        {status === 'saved' ? (
          <p role="status" className="text-sm text-ink">
            {t('successMessage')}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p role="alert" className="text-sm text-feedback-incorrect">
            {t('errorMessage')}
          </p>
        ) : null}
      </div>
    </form>
  );
}
