'use client';

import type { BetaFeedbackSort } from '@englishlearn/db/queries/feedback';
import { Button } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { exportFeedbackCsvAction } from './actions';

/** Hand the browser the CSV to save, without leaving the page. */
function download(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next task: Safari may not have started reading the blob yet.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** "Export CSV" for the feedback list, in the current sort. */
export function ExportFeedback({ sort }: { sort: BetaFeedbackSort }) {
  const t = useTranslations('admin.feedback.export');
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  // Set synchronously before the action: a double click must not export twice.
  const sending = useRef(false);

  function exportCsv() {
    if (sending.current) return;
    sending.current = true;
    setFailed(false);
    startTransition(async () => {
      try {
        const res = await exportFeedbackCsvAction({ sort });
        if (!res.ok) {
          setFailed(true);
          return;
        }
        download(res.value.fileName, res.value.csv);
      } catch {
        // No reply: the button stays, and clicking tries again.
        setFailed(true);
      } finally {
        sending.current = false;
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" size="sm" onClick={exportCsv} disabled={pending}>
        {pending ? t('downloading') : t('button')}
      </Button>
      {failed ? (
        <p role="alert" className="text-sm text-feedback-incorrect">
          {t('error')}
        </p>
      ) : null}
    </div>
  );
}
