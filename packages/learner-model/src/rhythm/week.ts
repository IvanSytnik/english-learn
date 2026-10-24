/**
 * WeekRhythm read model (HANDOFF §7, Case D; §8 #9): sessions this ISO week
 * against a goal of three — no streak.
 *
 * A "session" is a calendar day of the current ISO week (Monday first) with
 * at least WEEK_SESSION_MIN_ATTEMPTS ITEM_ATTEMPTED events. LEARNER_BOOTSTRAPPED
 * never counts. Day and week boundaries follow the learner's IANA time zone,
 * sent by the client; anything invalid falls back to UTC.
 *
 * Days are compared as local calendar dates ("2026-10-25"), never as 24-hour
 * spans, so DST transitions need no special handling.
 */

/** Minimum answers on one day for it to count — the 5-minute picker option. */
export const WEEK_SESSION_MIN_ATTEMPTS = 5;

export const WEEK_SESSION_GOAL = 3;

const DAY_MS = 86_400_000;

/**
 * Wider than any ISO week seen from any time zone: Monday 00:00 local is at
 * most 7 days (plus a DST hour) before Sunday 23:59 local.
 */
const WINDOW_MS = 8 * DAY_MS;

export type RhythmEvent = { type: string; occurredAt: number };

export type WeekRhythmDay = {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  attempts: number;
  counted: boolean;
  isToday: boolean;
  isFuture: boolean;
};

export type WeekRhythm = {
  /** Monday … Sunday. */
  days: WeekRhythmDay[];
  sessions: number;
  goal: number;
  timeZone: string;
};

/** A usable IANA zone name, or 'UTC' for anything else. */
export function resolveTimeZone(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 64) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/** Event time range the caller should load: a superset of the current week. */
export function weekQueryWindow(nowMs: number): { fromMs: number; toMs: number } {
  return { fromMs: nowMs - WINDOW_MS, toMs: nowMs };
}

function localDate(ms: number, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);
}

/** Calendar arithmetic on YYYY-MM-DD, done in UTC where days are always 24 h. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

export function computeWeekRhythm(args: {
  events: readonly RhythmEvent[];
  timeZone: unknown;
  nowMs: number;
}): WeekRhythm {
  const timeZone = resolveTimeZone(args.timeZone);
  const today = localDate(args.nowMs, timeZone);
  const monday = addDays(today, 1 - isoWeekday(today));

  const attempts = new Map<string, number>();
  for (const event of args.events) {
    if (event.type !== 'ITEM_ATTEMPTED' || event.occurredAt > args.nowMs) continue;
    const date = localDate(event.occurredAt, timeZone);
    attempts.set(date, (attempts.get(date) ?? 0) + 1);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const count = attempts.get(date) ?? 0;
    return {
      date,
      attempts: count,
      counted: count >= WEEK_SESSION_MIN_ATTEMPTS,
      isToday: date === today,
      isFuture: date > today,
    };
  });

  return {
    days,
    sessions: days.filter((d) => d.counted).length,
    goal: WEEK_SESSION_GOAL,
    timeZone,
  };
}
