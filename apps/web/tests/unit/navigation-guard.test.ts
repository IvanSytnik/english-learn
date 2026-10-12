import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Invariant: nothing under app/[locale]/ redirects with next/navigation.
 * Its `redirect` / `permanentRedirect` take a raw path, which is how an
 * unprefixed (= en) URL ended up rendering ru content after login. Use
 * `redirect` from '@/i18n/navigation' (or lib/auth-redirect.ts) instead.
 * Other next/navigation exports (notFound, unstable_rethrow, …) are fine.
 */

const LOCALE_DIR = join(__dirname, '../../app/[locale]');
const FORBIDDEN = new Set(['redirect', 'permanentRedirect']);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Returns human-readable offences for one file (empty array = compliant). */
export function findNavigationOffences(fileName: string, code: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const offences: string[] = [];

  for (const stmt of source.statements) {
    const isImport = ts.isImportDeclaration(stmt);
    const isReExport = ts.isExportDeclaration(stmt);
    if (!isImport && !isReExport) continue;
    const specifier = stmt.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier) || specifier.text !== 'next/navigation')
      continue;
    const line = source.getLineAndCharacterOfPosition(stmt.getStart(source)).line + 1;

    const bindings = isImport ? stmt.importClause?.namedBindings : stmt.exportClause;
    if (!bindings || ts.isNamespaceImport(bindings) || ts.isNamespaceExport(bindings)) {
      // `import * as nav` / `export *` can reach redirect without naming it.
      if (isImport && !stmt.importClause) continue; // side-effect import
      offences.push(`line ${line}: namespace import/export of 'next/navigation'`);
      continue;
    }
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (FORBIDDEN.has(imported)) {
        offences.push(`line ${line}: '${imported}' from 'next/navigation'`);
      }
    }
  }
  return offences;
}

describe('navigation guard: app/[locale]/**', () => {
  it('finds files to check (guard is not vacuous)', () => {
    expect(walk(LOCALE_DIR).length).toBeGreaterThan(0);
  });

  it("does not use redirect/permanentRedirect from 'next/navigation'", () => {
    const offenders = walk(LOCALE_DIR).flatMap((file) =>
      findNavigationOffences(file, readFileSync(file, 'utf8')).map(
        (offence) => `  app/[locale]/${relative(LOCALE_DIR, file)}: ${offence}`,
      ),
    );
    expect(
      offenders,
      `Use redirect from '@/i18n/navigation' instead:\n${offenders.join('\n')}\n`,
    ).toEqual([]);
  });
});

describe('findNavigationOffences', () => {
  it.each([
    ["import { redirect } from 'next/navigation';", "line 1: 'redirect' from 'next/navigation'"],
    [
      "import { permanentRedirect } from 'next/navigation';",
      "line 1: 'permanentRedirect' from 'next/navigation'",
    ],
    [
      "import { redirect as go } from 'next/navigation';",
      "line 1: 'redirect' from 'next/navigation'",
    ],
    ["export { redirect } from 'next/navigation';", "line 1: 'redirect' from 'next/navigation'"],
    [
      "import * as nav from 'next/navigation';",
      "line 1: namespace import/export of 'next/navigation'",
    ],
  ])('flags %s', (code, offence) => {
    expect(findNavigationOffences('page.tsx', code)).toEqual([offence]);
  });

  it.each([
    "import { notFound, unstable_rethrow } from 'next/navigation';",
    "import { redirect } from '@/i18n/navigation';",
    "import type { ReadonlyURLSearchParams } from 'next/navigation';",
  ])('accepts %s', (code) => {
    expect(findNavigationOffences('page.tsx', code)).toEqual([]);
  });
});
