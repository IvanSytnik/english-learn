/** Typed result for server actions (see docs/CONVENTIONS.md). */
export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };
