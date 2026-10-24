'use client';

import type { WeekRhythm as WeekRhythmData } from '@englishlearn/learner-model';
import { WeekRhythm } from '@englishlearn/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { weekRhythm } from './actions';

/**
 * This week's sessions under the session summary. The day boundaries need
 * the learner's own time zone, which only the browser knows; the server
 * validates it (invalid → UTC). Renders nothing until loaded or on error.
 */
export function WeekRhythmPanel() {
  const t = useTranslations('learning.week');
  const format = useFormatter();
  const [data, setData] = useState<WeekRhythmData | null>(null);

  useEffect(() => {
    let live = true;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    weekRhythm(timeZone)
      .then((res) => {
        if (live && res.ok) setData(res.value);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!data) return null;

  return (
    <WeekRhythm
      title={t('title')}
      summary={t('progress', { done: data.sessions, goal: data.goal })}
      note={data.sessions >= data.goal ? t('goalMet') : t('rule')}
      days={data.days.map((day) => ({
        key: day.date,
        // A calendar date: format it at UTC midnight so no zone shifts the day.
        label: format.dateTime(new Date(`${day.date}T00:00:00Z`), {
          weekday: 'short',
          timeZone: 'UTC',
        }),
        counted: day.counted,
        isToday: day.isToday,
      }))}
      dayLabels={{ counted: t('dayDone'), open: t('dayOpen'), today: t('today') }}
    />
  );
}
