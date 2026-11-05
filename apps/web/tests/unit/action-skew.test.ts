import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { describe, expect, it, vi } from 'vitest';
import {
  callServerAction,
  isUnknownServerAction,
  SKEW_RELOAD_KEY,
  SKEW_RELOAD_WINDOW_MS,
  type SkewEnv,
} from '@/lib/action-skew';

/**
 * V2-15: a page from before a deploy calls an action the server no longer
 * knows. One hard reload, guarded by a sessionStorage timestamp; a second
 * failure inside the window is the caller's normal error.
 */

// What Next 16.2 throws on the client (server-action-reducer, error E715).
const unknownAction = () =>
  new UnrecognizedActionError('Server Action "7f00aa" was not found on the server.');

function env(now = 1_000_000): SkewEnv & { store: Map<string, string>; clock: { now: number } } {
  const store = new Map<string, string>();
  const clock = { now };
  return {
    store,
    clock,
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    },
    reload: vi.fn(),
    now: () => clock.now,
  };
}

/** Settled within a tick, or 'pending'. */
const settle = <T>(p: Promise<T>) =>
  Promise.race([
    p.then(
      (v) => ({ value: v }),
      (e: unknown) => ({ error: e }),
    ),
    new Promise<'pending'>((r) => setTimeout(() => r('pending'), 20)),
  ]);

describe('isUnknownServerAction', () => {
  it('recognizes Next’s error, by class and by name; nothing else', () => {
    expect(isUnknownServerAction(unknownAction())).toBe(true);
    expect(
      isUnknownServerAction(Object.assign(new Error('x'), { name: 'UnrecognizedActionError' })),
    ).toBe(true);
    expect(isUnknownServerAction(new Error('Server Action failed'))).toBe(false);
    expect(isUnknownServerAction(new TypeError('Failed to fetch'))).toBe(false);
    expect(isUnknownServerAction(null)).toBe(false);
  });
});

describe('callServerAction', () => {
  it('passes a result through and clears the reload flag', async () => {
    const e = env();
    e.store.set(SKEW_RELOAD_KEY, '1');
    await expect(callServerAction(async () => 42, e)).resolves.toBe(42);
    expect(e.store.has(SKEW_RELOAD_KEY)).toBe(false);
    expect(e.reload).not.toHaveBeenCalled();
  });

  it('any other error is the caller’s, untouched', async () => {
    const e = env();
    const err = new Error('offline');
    await expect(callServerAction(() => Promise.reject(err), e)).rejects.toBe(err);
    expect(e.reload).not.toHaveBeenCalled();
    expect(e.store.size).toBe(0);
  });

  it('unknown action: one reload, flag stamped, the call never settles', async () => {
    const e = env();
    const result = await settle(callServerAction(() => Promise.reject(unknownAction()), e));
    expect(result).toBe('pending');
    expect(e.reload).toHaveBeenCalledTimes(1);
    expect(e.store.get(SKEW_RELOAD_KEY)).toBe(String(e.clock.now));
  });

  it('a second failure after the reload: the normal error, no second reload', async () => {
    const e = env();
    void callServerAction(() => Promise.reject(unknownAction()), e);
    await vi.waitFor(() => expect(e.reload).toHaveBeenCalledTimes(1));
    e.clock.now += 3_000; // the reloaded page, a few seconds later
    const again = unknownAction();
    await expect(callServerAction(() => Promise.reject(again), e)).rejects.toBe(again);
    expect(e.reload).toHaveBeenCalledTimes(1);
  });

  it('after the window, or after a success, a new deploy may reload again', async () => {
    const e = env();
    e.store.set(SKEW_RELOAD_KEY, String(e.clock.now - SKEW_RELOAD_WINDOW_MS));
    expect(await settle(callServerAction(() => Promise.reject(unknownAction()), e))).toBe(
      'pending',
    );
    expect(e.reload).toHaveBeenCalledTimes(1);
    await callServerAction(async () => 'ok', e);
    expect(await settle(callServerAction(() => Promise.reject(unknownAction()), e))).toBe(
      'pending',
    );
    expect(e.reload).toHaveBeenCalledTimes(2);
  });

  it('no sessionStorage: no guard, so no reload — the normal error', async () => {
    const e = { ...env(), storage: null };
    const err = unknownAction();
    await expect(callServerAction(() => Promise.reject(err), e)).rejects.toBe(err);
    expect(e.reload).not.toHaveBeenCalled();
  });
});
