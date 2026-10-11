/**
 * Vercel packaging check for the Prisma query compiler.
 *
 *   cd apps/web
 *   vercel pull --yes --environment=production
 *   SKIP_ENV_VALIDATION=1 vercel build --prod --yes
 *   pnpm check:bundle
 *
 * Reads each DB-using function's bundled server chunks and verifies that what the
 * client will load at runtime is actually shipped in the function:
 * - MODULE (prisma-client generator): `import("<pkg>/runtime/query_compiler_bg.<db>.wasm-base64.mjs")`,
 *   where <pkg> may be Turbopack's hashed external alias `@prisma/client-<hash>` — a
 *   symlink under `<cwd>/.next/node_modules` whose target must be shipped too.
 * - FILE (prisma-client-js): `readFileSync(join(config.dirname, 'query_compiler_bg.wasm'))`;
 *   the bundler's `/ROOT/...` __dirname never exists at runtime, so the client reads
 *   `<cwd>/src/generated/client`.
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const outDir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '../.vercel/output'));
const FUNCTIONS = ['api/health.func', '[locale]/register.func'];

type VcConfig = { handler: string; runtime?: string; filePathMap?: Record<string, string> };

function checkFunction(fn: string): boolean {
  const dir = realpathSync(path.join(outDir, 'functions', fn));
  const cfg = JSON.parse(readFileSync(path.join(dir, '.vc-config.json'), 'utf8')) as VcConfig;
  const files = cfg.filePathMap ?? {};
  const src = (key: string) => path.resolve(repoRoot, files[key] ?? key);
  const cwd = path.posix.dirname(cfg.handler); // the launcher chdirs here
  const bundle = Object.keys(files)
    .filter((k) => k.startsWith(`${cwd}/.next/server/`) && k.endsWith('.js'))
    .map((k) => readFileSync(src(k), 'utf8'))
    .join('\n');
  console.log(`=== ${fn}  (runtime ${cfg.runtime}, cwd /var/task/${cwd})`);

  const moduleImport = bundle.match(
    /"(@prisma\/client(?:-[0-9a-f]+)?)\/runtime\/(query_compiler_bg\.\w+\.wasm-base64\.m?js)"/,
  );
  const fsWasm = /readFileSync\(/.test(bundle) && bundle.includes('query_compiler_bg.wasm"');

  if (moduleImport && !fsWasm) {
    const [, pkg = '', file = ''] = moduleImport;
    console.log(`  mode: MODULE  import "${pkg}/runtime/${file}"`);
    if (pkg === '@prisma/client') {
      const hit = Object.keys(files).find((k) => k.endsWith(`/@prisma/client/runtime/${file}`));
      console.log(`  shipped: ${hit ?? 'MISSING'}`);
      return Boolean(hit);
    }
    const alias = `${cwd}/.next/node_modules/${pkg}`;
    const aliasShipped = alias in files && lstatSync(src(alias)).isSymbolicLink();
    const target = aliasShipped
      ? path.posix.normalize(path.posix.join(path.posix.dirname(alias), readlinkSync(src(alias))))
      : undefined;
    const targetFile = target && `${target}/runtime/${file}`;
    const shipped = Boolean(targetFile && targetFile in files && existsSync(src(targetFile)));
    console.log(`  alias shipped: ${aliasShipped}  (${alias})`);
    console.log(`  alias -> ${target ?? '(unresolved)'}`);
    console.log(`  target file shipped: ${shipped}`);
    return aliasShipped && shipped;
  }
  if (fsWasm) {
    const target = `${cwd}/src/generated/client/query_compiler_bg.wasm`;
    const shipped = target in files;
    console.log(`  mode: FILE  client will read /var/task/${target}; shipped: ${shipped}`);
    return shipped;
  }
  console.log('  could not identify the query compiler loader in the bundle');
  return false;
}

let ok = true;
for (const fn of FUNCTIONS) {
  const pass = checkFunction(fn);
  console.log(`  RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  ok &&= pass;
}
process.exit(ok ? 0 : 1);
