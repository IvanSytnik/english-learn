/**
 * Colloquial reductions written without an apostrophe (HANDOFF #46): `gonna`,
 * `wanna`, `gotta`, … — a function-word phrase run together, the same thing
 * as a contraction (`don't`) in another spelling. The contraction table
 * cannot hold them (it is generated stems × suffixes, V2-20) and the
 * apostrophe rule of the generation gate cannot see them, so they are named
 * here: the paste import shows them with the function words, never as "not
 * found", and the B6.10 gate refuses them before any LLM call.
 *
 * Data, never a heuristic (V2-10): each form with the words it stands for,
 * every one of them a function word or a catalogue word (checked by test).
 * The catalogue is matched first, as for contractions.
 */
export const COLLOQUIAL_REDUCTIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ['gonna', ['going', 'to']],
  ['wanna', ['want', 'to']],
  ['gotta', ['got', 'to']],
  ['hafta', ['have', 'to']],
  ['oughta', ['ought', 'to']],
  ['gimme', ['give', 'me']],
  ['lemme', ['let', 'me']],
  ['kinda', ['kind', 'of']],
  ['sorta', ['sort', 'of']],
  ['outta', ['out', 'of']],
  ['dunno', ['do', 'not', 'know']],
  ['coulda', ['could', 'have']],
  ['shoulda', ['should', 'have']],
  ['woulda', ['would', 'have']],
  ['mighta', ['might', 'have']],
  ['musta', ['must', 'have']],
]);
