import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBuildId, serveGuarded } from '../../scripts/e2e-serve';

/**
 * The e2e server guard (pitfall 86): a `next build` rewriting `.next` under
 * the live e2e server stops it with a clear message instead of failing tests
 * with another build's chunks and server actions.
 */

const dirs: string[] = [];
function buildDir(buildId: string | null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-serve-'));
  dirs.push(dir);
  if (buildId !== null) writeFileSync(path.join(dir, 'BUILD_ID'), buildId);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A server that runs until it is stopped.
const FOREVER = [process.execPath, '-e', 'setInterval(() => {}, 1000)'] as const;

describe('e2e-serve', () => {
  it('reads the build id; none while missing', () => {
    expect(readBuildId(buildDir('abc\n'))).toBe('abc');
    expect(readBuildId(buildDir(null))).toBeNull();
  });

  it('no build: refuses to start the server', async () => {
    const log: string[] = [];
    const code = await serveGuarded({
      dir: buildDir(null),
      intervalMs: 20,
      command: FOREVER,
      log: (l) => log.push(l),
    });
    expect(code).toBe(1);
    expect(log.join('\n')).toMatch(/BUILD_ID — build first/);
  });

  it('BUILD_ID changes during the run: stops the server, exit 1, says why', async () => {
    const dir = buildDir('build-a');
    const log: string[] = [];
    const run = serveGuarded({ dir, intervalMs: 20, command: FOREVER, log: (l) => log.push(l) });
    await new Promise((r) => setTimeout(r, 100));
    writeFileSync(path.join(dir, 'BUILD_ID'), 'build-b');
    expect(await run).toBe(1);
    expect(log.join('\n')).toMatch(/changed during the run \(build-a → build-b\)/);
  });

  it('BUILD_ID removed mid-rebuild counts as a change', async () => {
    const dir = buildDir('build-a');
    const run = serveGuarded({ dir, intervalMs: 20, command: FOREVER, log: () => {} });
    await new Promise((r) => setTimeout(r, 100));
    rmSync(path.join(dir, 'BUILD_ID'));
    expect(await run).toBe(1);
  });

  it('an unchanged build: the server’s own exit code passes through', async () => {
    const dir = buildDir('build-a');
    const exit = (code: number) =>
      serveGuarded({
        dir,
        intervalMs: 20,
        command: [process.execPath, '-e', `setTimeout(() => process.exit(${code}), 100)`],
        log: () => {},
      });
    expect(await exit(0)).toBe(0);
    expect(await exit(3)).toBe(3);
  });
});
