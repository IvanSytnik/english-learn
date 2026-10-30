import type { BetaFeedbackListEntry } from '@englishlearn/db/queries/feedback';

const COLUMNS = [
  'createdAt',
  'email',
  'name',
  'kind',
  'text',
  'url',
  'itemId',
  'conceptId',
] as const;

// A spreadsheet runs a cell that starts with one of these as a formula (OWASP
// "CSV injection"); the text comes from learners, so it is never trusted.
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One RFC 4180 field: a formula-looking value is defused with a leading `'`,
 * then every field is quoted and inner quotes doubled — commas, quotes and
 * line breaks in a message stay inside their cell.
 */
export function csvCell(value: string | null): string {
  const text = value ?? '';
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * The admin feedback export: a header row and one row per report, CRLF line
 * ends, UTF-8 with a BOM so Excel reads Cyrillic correctly. Times are ISO UTC.
 */
export function toFeedbackCsv(rows: BetaFeedbackListEntry[]): string {
  const lines = [
    COLUMNS.map(csvCell),
    ...rows.map((r) =>
      [
        r.createdAt.toISOString(),
        r.user.email,
        r.user.name,
        r.kind,
        r.text,
        r.url,
        r.itemId,
        r.conceptId,
      ].map(csvCell),
    ),
  ];
  return `\uFEFF${lines.map((cells) => cells.join(',')).join('\r\n')}\r\n`;
}
