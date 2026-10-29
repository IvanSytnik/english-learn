/**
 * The browser's IANA time zone for server reads that depend on the learner's
 * day (vocabulary allowance, week rhythm). Undefined if the runtime cannot
 * tell; the server treats that, like anything invalid, as UTC.
 */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
