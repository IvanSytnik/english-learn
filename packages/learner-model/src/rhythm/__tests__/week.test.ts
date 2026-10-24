import { describe, expect, it } from 'vitest';
import {
  computeWeekRhythm,
  type RhythmEvent,
  resolveTimeZone,
  WEEK_SESSION_GOAL,
  weekQueryWindow,
} from '../week';

const at = (iso: string) => Date.parse(iso);
const attempts = (iso: string, n: number): RhythmEvent[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'ITEM_ATTEMPTED', occurredAt: at(iso) + i * 1000 }));

const counted = (r: ReturnType<typeof computeWeekRhythm>) =>
  r.days.filter((d) => d.counted).map((d) => d.date);

// Week of Mon 2026-10-19 … Sun 2026-10-25. Vienna leaves summer time on
// Sun 2026-10-25 at 03:00 CEST → 02:00 CET (UTC+2 → UTC+1).
const VIENNA = 'Europe/Vienna';
const WED_NOON_VIENNA = at('2026-10-21T10:00:00Z');

describe('computeWeekRhythm', () => {
  it('lays out Monday…Sunday of the ISO week containing today', () => {
    const r = computeWeekRhythm({ events: [], timeZone: VIENNA, nowMs: WED_NOON_VIENNA });
    expect(r.days.map((d) => d.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(r.days.map((d) => d.isToday)).toEqual([false, false, true, false, false, false, false]);
    expect(r.days.map((d) => d.isFuture)).toEqual([false, false, false, true, true, true, true]);
    expect(r).toMatchObject({ sessions: 0, goal: WEEK_SESSION_GOAL, timeZone: VIENNA });
  });

  it('a session at 00:30 in Vienna belongs to that local day, not the UTC one', () => {
    // Tue 00:30 CEST = Mon 22:30 UTC.
    const r = computeWeekRhythm({
      events: attempts('2026-10-19T22:30:00Z', 5),
      timeZone: VIENNA,
      nowMs: WED_NOON_VIENNA,
    });
    expect(counted(r)).toEqual(['2026-10-20']);
    const utc = computeWeekRhythm({
      events: attempts('2026-10-19T22:30:00Z', 5),
      timeZone: 'UTC',
      nowMs: WED_NOON_VIENNA,
    });
    expect(counted(utc)).toEqual(['2026-10-19']);
  });

  it('4 answers on a day do not count, 5 do', () => {
    const four = computeWeekRhythm({
      events: attempts('2026-10-20T08:00:00Z', 4),
      timeZone: VIENNA,
      nowMs: WED_NOON_VIENNA,
    });
    expect(four.sessions).toBe(0);
    expect(four.days[1]).toMatchObject({ attempts: 4, counted: false });
    const five = computeWeekRhythm({
      events: attempts('2026-10-20T08:00:00Z', 5),
      timeZone: VIENNA,
      nowMs: WED_NOON_VIENNA,
    });
    expect(five.sessions).toBe(1);
    expect(five.days[1]).toMatchObject({ attempts: 5, counted: true });
  });

  it('a bootstrap event never counts towards a session', () => {
    const r = computeWeekRhythm({
      events: [
        ...attempts('2026-10-20T08:00:00Z', 4),
        { type: 'LEARNER_BOOTSTRAPPED', occurredAt: at('2026-10-20T08:10:00Z') },
      ],
      timeZone: VIENNA,
      nowMs: WED_NOON_VIENNA,
    });
    expect(r.days[1]).toMatchObject({ attempts: 4, counted: false });
  });

  it('the same instants fall on different days in another time zone', () => {
    // Wed 23:00 UTC: Wed 16:00 in Los Angeles, Thu 08:00 in Tokyo.
    const events = attempts('2026-10-21T23:00:00Z', 5);
    const nowMs = at('2026-10-23T12:00:00Z');
    expect(counted(computeWeekRhythm({ events, timeZone: 'America/Los_Angeles', nowMs }))).toEqual([
      '2026-10-21',
    ]);
    expect(counted(computeWeekRhythm({ events, timeZone: 'Asia/Tokyo', nowMs }))).toEqual([
      '2026-10-22',
    ]);
  });

  it('counts sessions on both sides of a DST change within one week', () => {
    // Sun 2026-10-25 23:30 CET (= 22:30 UTC), after the clocks went back; now
    // is Sun 23:59 CET. Monday of the same week was still CEST.
    const nowMs = at('2026-10-25T22:59:00Z');
    const r = computeWeekRhythm({
      events: [
        ...attempts('2026-10-18T22:00:00Z', 5), // Mon 00:00 CEST
        ...attempts('2026-10-25T00:30:00Z', 5), // Sun 02:30 CEST (before the change)
        ...attempts('2026-10-25T22:30:00Z', 5), // Sun 23:30 CET (after the change)
      ],
      timeZone: VIENNA,
      nowMs,
    });
    expect(counted(r)).toEqual(['2026-10-19', '2026-10-25']);
    expect(r.days[6]).toMatchObject({ attempts: 10, isToday: true });
  });

  it('spring forward: the short Sunday still works as one day', () => {
    // Vienna: Sun 2026-03-29 02:00 CET → 03:00 CEST. Week Mon 23 … Sun 29 March.
    const nowMs = at('2026-03-29T21:00:00Z'); // Sun 23:00 CEST
    const r = computeWeekRhythm({
      events: [
        ...attempts('2026-03-29T00:30:00Z', 3), // Sun 01:30 CET
        ...attempts('2026-03-29T01:30:00Z', 2), // Sun 03:30 CEST
      ],
      timeZone: VIENNA,
      nowMs,
    });
    expect(r.days[0]?.date).toBe('2026-03-23');
    expect(counted(r)).toEqual(['2026-03-29']);
  });

  it('an invalid time zone falls back to UTC', () => {
    const events = attempts('2026-10-19T22:30:00Z', 5);
    const r = computeWeekRhythm({ events, timeZone: 'Mars/Olympus_Mons', nowMs: WED_NOON_VIENNA });
    expect(r.timeZone).toBe('UTC');
    expect(counted(r)).toEqual(['2026-10-19']);
  });

  it('ignores events after now and reaches the goal at three days', () => {
    const r = computeWeekRhythm({
      events: [
        ...attempts('2026-10-19T08:00:00Z', 5),
        ...attempts('2026-10-20T08:00:00Z', 6),
        ...attempts('2026-10-21T08:00:00Z', 5),
        ...attempts('2026-10-22T08:00:00Z', 5), // tomorrow
      ],
      timeZone: VIENNA,
      nowMs: WED_NOON_VIENNA,
    });
    expect(r.sessions).toBe(3);
    expect(r.sessions).toBeGreaterThanOrEqual(r.goal);
    expect(r.days[3]).toMatchObject({ attempts: 0, counted: false });
  });
});

describe('weekQueryWindow', () => {
  // What the DB returns: only events inside the window.
  const load = (events: RhythmEvent[], nowMs: number) => {
    const { fromMs, toMs } = weekQueryWindow(nowMs);
    return events.filter((e) => e.occurredAt >= fromMs && e.occurredAt <= toMs);
  };

  it('from the last minute of Sunday, Monday 00:00 is in and the Sunday before is out', () => {
    const nowMs = at('2026-10-25T22:59:00Z'); // Sun 23:59 CET, DST week
    const mondayStart = attempts('2026-10-18T22:00:00Z', 5); // Mon 19 00:00 CEST
    const sundayBefore = attempts('2026-10-18T21:59:00Z', 1).concat(
      attempts('2026-10-18T21:50:00Z', 4),
    ); // Sun 18 23:50–23:59 CEST
    const loaded = load([...mondayStart, ...sundayBefore], nowMs);
    expect(loaded).toHaveLength(10); // the window over-fetches; the fold decides
    const r = computeWeekRhythm({ events: loaded, timeZone: VIENNA, nowMs });
    expect(counted(r)).toEqual(['2026-10-19']);
    expect(r.days[0]?.attempts).toBe(5);
  });

  it('covers Monday 00:00 local from Sunday 23:59 in the extreme time zones', () => {
    for (const [timeZone, nowIso, mondayIso] of [
      ['Pacific/Kiritimati', '2026-10-25T09:59:00Z', '2026-10-18T10:00:00Z'], // UTC+14
      ['Pacific/Pago_Pago', '2026-10-26T10:59:00Z', '2026-10-19T11:00:00Z'], // UTC−11
    ] as const) {
      const nowMs = at(nowIso);
      const r = computeWeekRhythm({ events: [], timeZone, nowMs });
      expect(r.days[0]?.date, timeZone).toBe('2026-10-19');
      expect(r.days[6]?.isToday, timeZone).toBe(true);
      expect(weekQueryWindow(nowMs).fromMs, timeZone).toBeLessThanOrEqual(at(mondayIso));
    }
  });
});

describe('resolveTimeZone', () => {
  it('keeps valid IANA names and canonicalises their case', () => {
    expect(resolveTimeZone('Europe/Vienna')).toBe('Europe/Vienna');
    expect(resolveTimeZone('europe/vienna')).toBe('Europe/Vienna');
    expect(resolveTimeZone('UTC')).toBe('UTC');
  });

  it('falls back to UTC for anything else', () => {
    for (const raw of ['', 'Mars/Olympus_Mons', 'Europe/Vienna; DROP', 'x'.repeat(65)]) {
      expect(resolveTimeZone(raw), raw).toBe('UTC');
    }
    for (const raw of [undefined, null, 0, ['Europe/Vienna'], {}]) {
      expect(resolveTimeZone(raw), String(raw)).toBe('UTC');
    }
  });
});
