'use client';

import { Button } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { exportUserDataAction } from './actions';

/** Hand the browser a JSON file to save, without leaving the page. */
function download(fileName: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next task: Safari may not have started reading the blob yet.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** GDPR export: everything stored about the user, as `englishlearn-data-<userId>.json`. */
export function ExportData() {
  const t = useTranslations('settings.export');
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  // Set synchronously before the action: a double click must not export twice.
  const sending = useRef(false);

  function exportData() {
    if (sending.current) return;
    sending.current = true;
    setFailed(false);
    startTransition(async () => {
      try {
        const res = await exportUserDataAction();
        if (!res.ok) {
          setFailed(true);
          return;
        }
        download(`englishlearn-data-${res.value.user.id}.json`, JSON.stringify(res.value, null, 2));
      } catch {
        // No reply: the button stays, and clicking tries again.
        setFailed(true);
      } finally {
        sending.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{t('description')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={exportData} disabled={pending}>
          {pending ? t('downloadingButton') : t('downloadButton')}
        </Button>
        {failed ? (
          <p role="alert" className="text-sm text-feedback-incorrect">
            {t('errorMessage')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
