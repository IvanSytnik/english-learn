import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { localDate } from '../../rhythm/week';
import { localDayStartMs } from '../day';

const ZONES = [
  'UTC',
  'Europe/Berlin',
  'Europe/Kyiv',
  'Asia/Kolkata',
  'America/Los_Angeles',
  'America/Santiago',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
  'Australia/Lord_Howe',
];

describe('localDayStartMs', () => {
  it.each([
    ['UTC', '2026-10-29T15:00:00Z', '2026-10-29T00:00:00.000Z'],
    ['Europe/Berlin', '2026-10-29T15:00:00Z', '2026-10-28T23:00:00.000Z'],
    ['Europe/Berlin', '2026-07-01T15:00:00Z', '2026-06-30T22:00:00.000Z'],
    ['Asia/Kolkata', '2026-10-29T15:00:00Z', '2026-10-28T18:30:00.000Z'],
    ['America/Los_Angeles', '2026-10-29T03:00:00Z', '2026-10-28T07:00:00.000Z'],
    // Spring forward at 02:00: the day still starts at local midnight (CET).
    ['Europe/Berlin', '2026-03-29T12:00:00Z', '2026-03-28T23:00:00.000Z'],
    // Chile skips midnight (00:00 -> 01:00, first Sunday of September).
    ['America/Santiago', '2026-09-06T15:00:00Z', '2026-09-06T04:00:00.000Z'],
  ])('%s at %s -> %s', (tz, now, start) => {
    expect(new Date(localDayStartMs(Date.parse(now), tz)).toISOString()).toBe(start);
  });

  it('falls back to UTC for an invalid time zone', () => {
    const now = Date.parse('2026-10-29T15:00:00Z');
    for (const tz of ['Mars/Olympus', '', 42, null, 'x'.repeat(65)]) {
      expect(localDayStartMs(now, tz)).toBe(Date.parse('2026-10-29T00:00:00Z'));
    }
  });

  it('is the first instant of the local day, in every zone', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.parse('2024-01-01'), max: Date.parse('2030-01-01') }),
        fc.constantFrom(...ZONES),
        (now, tz) => {
          const start = localDayStartMs(now, tz);
          const today = localDate(now, tz);
          expect(start).toBeLessThanOrEqual(now);
          expect(localDate(start, tz)).toBe(today);
          expect(localDate(start - 1, tz) < today).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});
