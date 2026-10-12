import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Invariant: everything under an admin/ or tutor/ route segment guards itself.
 * - every page.tsx / layout.tsx default export calls requireRole(...)
 * - every server action ('use server' file export or inline 'use server'
 *   function) calls authorizeAction(...)
 * Layouts and the proxy do not protect pages rendered on their own or actions.
 */

const APP_DIR = join(__dirname, '../../app');
const GUARDED_SEGMENTS = new Set(['admin', 'tutor']);
const ENTRY_FILES = new Set(['page.tsx', 'page.ts', 'layout.tsx', 'layout.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function hasUseServerDirective(statements: ts.NodeArray<ts.Statement>): boolean {
  for (const stmt of statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) return false;
    if (stmt.expression.text === 'use server') return true;
  }
  return false;
}

function callsFunction(node: ts.Node, name: string): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === kind);
}

function functionName(fn: FunctionLike, source: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  if (ts.isVariableDeclaration(fn.parent)) return fn.parent.name.getText(source);
  return `<anonymous@${source.getLineAndCharacterOfPosition(fn.getStart(source)).line + 1}>`;
}

/** Functions exported from a module: `export [default] function`, `export const x = () => {}`. */
function exportedFunctions(source: ts.SourceFile): FunctionLike[] {
  const fns: FunctionLike[] = [];
  for (const stmt of source.statements) {
    if (ts.isFunctionDeclaration(stmt) && hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      fns.push(stmt);
    } else if (ts.isVariableStatement(stmt) && hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      for (const decl of stmt.declarationList.declarations) {
        if (decl.initializer && isFunctionLike(decl.initializer)) fns.push(decl.initializer);
      }
    }
  }
  return fns;
}

function defaultExportedFunction(source: ts.SourceFile): FunctionLike | undefined {
  for (const stmt of source.statements) {
    if (
      ts.isFunctionDeclaration(stmt) &&
      hasModifier(stmt, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(stmt, ts.SyntaxKind.DefaultKeyword)
    ) {
      return stmt;
    }
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      if (isFunctionLike(stmt.expression)) return stmt.expression;
      if (ts.isIdentifier(stmt.expression)) {
        const name = stmt.expression.text;
        const target = exportedOrLocalFunction(source, name);
        if (target) return target;
      }
    }
  }
  return undefined;
}

function exportedOrLocalFunction(source: ts.SourceFile, name: string): FunctionLike | undefined {
  for (const stmt of source.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) return stmt;
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === name &&
          decl.initializer &&
          isFunctionLike(decl.initializer)
        ) {
          return decl.initializer;
        }
      }
    }
  }
  return undefined;
}

/** Returns human-readable offences for one file (empty array = compliant). */
export function findOffences(fileName: string, code: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const offences: string[] = [];
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;

  if (ENTRY_FILES.has(baseName)) {
    const fn = defaultExportedFunction(source);
    if (!fn) {
      offences.push('no default-exported function to check for requireRole()');
    } else if (!callsFunction(fn, 'requireRole')) {
      offences.push(`${functionName(fn, source)} does not call requireRole()`);
    }
  }

  if (hasUseServerDirective(source.statements)) {
    for (const fn of exportedFunctions(source)) {
      if (!callsFunction(fn, 'authorizeAction')) {
        offences.push(
          `server action ${functionName(fn, source)} ('use server' file) does not call authorizeAction()`,
        );
      }
    }
  }

  const visit = (node: ts.Node) => {
    if (isFunctionLike(node) && node.body && ts.isBlock(node.body)) {
      if (
        hasUseServerDirective(node.body.statements) &&
        !callsFunction(node.body, 'authorizeAction')
      ) {
        offences.push(
          `inline server action ${functionName(node, source)} does not call authorizeAction()`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return offences;
}

function guardedFiles(): string[] {
  return walk(APP_DIR).filter((file) =>
    relative(APP_DIR, file)
      .split(sep)
      .some((segment) => GUARDED_SEGMENTS.has(segment)),
  );
}

describe('authz guard: admin/ and tutor/ routes', () => {
  it('finds files to check (guard is not vacuous)', () => {
    expect(guardedFiles().length).toBeGreaterThan(0);
  });

  it('every page/layout calls requireRole and every server action calls authorizeAction', () => {
    const offenders = guardedFiles().flatMap((file) =>
      findOffences(file, readFileSync(file, 'utf8')).map(
        (offence) => `  app/${relative(APP_DIR, file)}: ${offence}`,
      ),
    );
    expect(offenders, `Unguarded admin/tutor code:\n${offenders.join('\n')}\n`).toEqual([]);
  });
});

describe('findOffences', () => {
  it('flags a page that does not call requireRole', () => {
    const code = 'export default async function Page() { return null; }';
    expect(findOffences('page.tsx', code)).toEqual(['Page does not call requireRole()']);
  });

  it('accepts a page that calls requireRole, including `export default Name`', () => {
    expect(
      findOffences('page.tsx', "export default async function P() { await requireRole('ADMIN'); }"),
    ).toEqual([]);
    expect(
      findOffences(
        'layout.tsx',
        "const L = async () => { await requireRole('ADMIN'); return null; };\nexport default L;",
      ),
    ).toEqual([]);
  });

  it('flags a page whose default export is not a function', () => {
    expect(findOffences('page.tsx', 'export default makePage();')).toEqual([
      'no default-exported function to check for requireRole()',
    ]);
  });

  it('flags exports of a "use server" file that skip authorizeAction', () => {
    const code = [
      "'use server';",
      "export async function ok() { const r = await authorizeAction('ADMIN'); }",
      'export async function bad() {}',
      'export const badArrow = async () => {};',
    ].join('\n');
    expect(findOffences('actions.ts', code)).toEqual([
      "server action bad ('use server' file) does not call authorizeAction()",
      "server action badArrow ('use server' file) does not call authorizeAction()",
    ]);
  });

  it('flags inline "use server" functions that skip authorizeAction', () => {
    const code = [
      "export default async function Page() { await requireRole('ADMIN');",
      "  async function save() { 'use server'; }",
      "  async function remove() { 'use server'; await authorizeAction('ADMIN'); }",
      '  return null; }',
    ].join('\n');
    expect(findOffences('page.tsx', code)).toEqual([
      'inline server action save does not call authorizeAction()',
    ]);
  });

  it('ignores a "use server" string that is not a directive', () => {
    const code =
      "export default async function Page() { await requireRole('ADMIN'); f(); 'use server'; }";
    expect(findOffences('page.tsx', code)).toEqual([]);
  });
});
