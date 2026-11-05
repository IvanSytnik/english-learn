import { unstable_isUnrecognizedActionError } from 'next/navigation';
import { hardReload } from './hard-reload';

/**
 * Recovery from deployment skew (B6-SPEC V2-15). Vercel Hobby has no Skew
 * Protection: a page loaded before a deploy calls server actions by the ids of
 * its own build, and after the deploy the server may not know them. Next
 * 16.2 then rejects the call on the client with `UnrecognizedActionError`
 * (`Server Action "<id>" was not found on the server`, error code E715; the
 * server logs "Failed to find Server Action"). The page needs the new build's
 * ids — one hard reload.
 *
 * Guarded by a sessionStorage timestamp, so a server that keeps refusing (a
 * genuine bug, not skew) never makes a reload loop: within
 * SKEW_RELOAD_WINDOW_MS of the last reload the error is rethrown and the
 * caller shows its normal error. Every successful call clears the flag.
 * Without sessionStorage (blocked, private mode) there is no guard, so no
 * reload either.
 *
 * Two entry points: `callServerAction` where the caller catches its own
 * errors (the vocabulary player), and `reloadOnceForSkew` in the `[locale]`
 * error boundary, which an action passed straight to a form or
 * `useActionState` rejects into (the login form, which keeps its
 * progressive enhancement that way).
 */

export const SKEW_RELOAD_KEY = 'englishlearn:action-skew-reload';
export const SKEW_RELOAD_WINDOW_MS = 5 * 60_000;

/** The browser bits the recovery uses; tests pass their own. */
export type SkewEnv = {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  reload: () => void;
  now: () => number;
};

export function browserEnv(): SkewEnv {
  let storage: SkewEnv['storage'] = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Storage blocked: no guard, so no reload.
  }
  return { storage, reload: hardReload, now: () => Date.now() };
}

/**
 * The server did not recognize the action: this page is from another build.
 * `name` as well as `instanceof`, in case Next's error class is loaded twice.
 */
export function isUnknownServerAction(err: unknown): boolean {
  return (
    unstable_isUnrecognizedActionError(err) ||
    (err instanceof Error && err.name === 'UnrecognizedActionError')
  );
}

/**
 * Run one server action call. On "Server Action not found" reload the page
 * once (the returned promise never settles: the page is going away); a second
 * such failure inside the window is rethrown like any other error.
 */
export async function callServerAction<T>(
  run: () => Promise<T>,
  env: SkewEnv = browserEnv(),
): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (err) {
    if (!reloadOnceForSkew(err, env)) throw err;
    return new Promise<T>(() => {});
  }
  try {
    env.storage?.removeItem(SKEW_RELOAD_KEY);
  } catch {
    // Nothing to clear without storage.
  }
  return result;
}

/**
 * If `err` is "Server Action not found" and no reload happened within the
 * window: record one and reload. True when the page is reloading.
 */
export function reloadOnceForSkew(err: unknown, env: SkewEnv = browserEnv()): boolean {
  if (!isUnknownServerAction(err) || !markReload(env)) return false;
  env.reload();
  return true;
}

/** Records this reload; false when one happened within the window (or no storage). */
function markReload(env: SkewEnv): boolean {
  const { storage } = env;
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(SKEW_RELOAD_KEY));
    if (last > 0 && env.now() - last < SKEW_RELOAD_WINDOW_MS) return false;
    storage.setItem(SKEW_RELOAD_KEY, String(env.now()));
    return true;
  } catch {
    return false;
  }
}
