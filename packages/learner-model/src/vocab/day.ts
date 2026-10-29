import { localDate, resolveTimeZone } from '../rhythm/week';

const HOUR_MS = 3_600_000;

/**
 * Start of the learner's local day (Unix ms) — the window of the daily
 * new-word limit. The time zone is the client's (`Intl…timeZone`), validated
 * like the week rhythm's: anything invalid is UTC.
 *
 * The first instant whose local date is today, found by bisection between
 * UTC midnight ∓ 15 h (every offset is within −12…+14 h) — so DST needs no
 * special case: on a day whose midnight does not exist (America/Santiago in
 * September) the day starts at 01:00.
 */
export function localDayStartMs(nowMs: number, timeZone: unknown): number {
  const tz = resolveTimeZone(timeZone);
  const today = localDate(nowMs, tz);
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const midnightUtc = Date.UTC(y, m - 1, d);

  let lo = midnightUtc - 15 * HOUR_MS; // local date: yesterday
  let hi = midnightUtc + 15 * HOUR_MS; // local date: today
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (localDate(mid, tz) < today) lo = mid;
    else hi = mid;
  }
  return hi;
}
