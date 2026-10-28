'use client';

import { buttonVariants } from '@englishlearn/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FeedbackDialog } from './feedback-dialog';

/** The global "Feedback" trigger: opens a blank report about anything. */
export function FeedbackButton() {
  const t = useTranslations('feedback');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonVariants({ variant: 'ghost' })}
        data-feedback-trigger=""
      >
        {t('trigger')}
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} initialKind="OTHER" />
    </>
  );
}
