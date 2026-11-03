/**
 * The original CEFR-J Wordlist CSV (`cefrj-vocabulary-profile-1.5.csv`,
 * openlanguageprofiles/olp-en-cefrj), read by offline scripts only. RFC 4180
 * subset: comma-separated, `"` quoting with `""` escapes, CRLF or LF.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/u, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('Unterminated quoted CSV field');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows as objects keyed by the header row; a row with another width throws. */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return rows
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r, i) => {
      if (r.length !== header.length) {
        throw new Error(`CSV row ${i + 2}: ${r.length} fields, header has ${header.length}`);
      }
      return Object.fromEntries(header.map((h, j) => [h, r[j] as string]));
    });
}
