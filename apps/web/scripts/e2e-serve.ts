/**
 * The e2e web server (playwright.config.ts `webServer`): runs the server
 * command on the build it starts with, and stops it the moment
 * `.next/BUILD_ID` changes or disappears.
 *
 *   tsx scripts/e2e-serve.ts [--dir .next] [--interval-ms 500] -- <server command…>
 *
 * A `next build` or `vercel build` in apps/web rewrites `.next` under the
 * live `next start` (pitfall 86). The run then fails on chunks and server
 * actions of another build ("Failed to find Server Action"), which looks
 * like an app bug. Stopping the server instead makes every later test fail
 * fast, with this message in the [WebServer] log.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The build id in `dir`, or null while there is none (missing, or mid-rebuild). */
export function readBuildId(dir: string): string | null {
  try {
    return readFileSync(path.join(dir, 'BUILD_ID'), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export type ServeOptions = {
  dir: string;
  intervalMs: number;
  command: readonly [string, ...string[]];
  log?: (line: string) => void;
};

/** Runs the server; resolves to the exit code this wrapper should exit with. */
export function serveGuarded({
  dir,
  intervalMs,
  command,
  log = console.error,
}: ServeOptions): Promise<number> {
  const initial = readBuildId(dir);
  if (initial === null) {
    log(`e2e-serve: no ${path.join(dir, 'BUILD_ID')} — build first.`);
    return Promise.resolve(1);
  }
  log(`e2e-serve: serving build ${initial} from ${dir}`);
  const [cmd, ...args] = command;
  const child = spawn(cmd, args, { stdio: 'inherit' });
  let rebuilt = false;
  const timer = setInterval(() => {
    const now = readBuildId(dir);
    if (now === initial) return;
    rebuilt = true;
    clearInterval(timer);
    log(
      `e2e-serve: ${path.join(dir, 'BUILD_ID')} changed during the run (${initial} → ${now ?? 'none'}). ` +
        'A `next build` or `vercel build` rewrote apps/web/.next under the live server; stopping it, ' +
        'so every result from here on is invalid. Build only while no e2e run is going (pitfall 86).',
    );
    child.kill('SIGTERM');
  }, intervalMs);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => child.kill(signal));
  }
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      clearInterval(timer);
      resolve(rebuilt ? 1 : (code ?? (signal ? 1 : 0)));
    });
    child.once('error', (err) => {
      clearInterval(timer);
      log(`e2e-serve: could not start ${cmd}: ${err.message}`);
      resolve(1);
    });
  });
}

function parseArgs(argv: readonly string[]): ServeOptions {
  const split = argv.indexOf('--');
  const own = split === -1 ? argv : argv.slice(0, split);
  const command = split === -1 ? [] : argv.slice(split + 1);
  const flag = (name: string) => {
    const i = own.indexOf(name);
    return i === -1 ? undefined : own[i + 1];
  };
  const [cmd, ...args] = command;
  if (cmd === undefined)
    throw new Error('usage: e2e-serve [--dir .next] [--interval-ms 500] -- <command…>');
  return {
    dir: flag('--dir') ?? '.next',
    intervalMs: Number(flag('--interval-ms') ?? 500),
    command: [cmd, ...args],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  serveGuarded(parseArgs(process.argv.slice(2))).then((code) => process.exit(code));
}
