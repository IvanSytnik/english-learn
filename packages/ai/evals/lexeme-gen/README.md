# Lexeme generation eval (B6.9)

Runs the lexeme generation prompt (`src/lexeme-gen`, used by B6.10) over a
golden set and scores each candidate deterministically. **Run it manually
before any change of the prompt, the model, the effort or the provider**, and
commit the results (B6-SPEC §6). A second provider is admitted only after it
passes this eval (V2-7).

```bash
# from packages/ai — the plan and its worst-case cost, no calls:
pnpm eval:lexeme-gen --dry-run --models claude-haiku-5-5,claude-sonnet-5-5
# the run (costs money; key from the environment or packages/db/.env):
pnpm eval:lexeme-gen --models claude-haiku-5-5,claude-sonnet-5-5
# options: --effort low|medium|high · --batch 10 · --timeout-ms 20000
#          --key-env ANTHROPIC_RUNTIME_API_KEY · --concurrency 2
```

Calls go through the runtime provider (`src/runtime/anthropic-provider.ts`)
with B6.10's settings: batches of ≤ 10, a 20 s deadline per call including
retries, structured output. They do **not** go through `runAiCall` — no DB,
no flags, no `AiUsage`; the cost is reported in the results instead.

## Files

- `golden.json` — the cases. Each input is a normalized candidate that passes
  the pre-LLM gate and is not a catalogue word or form (enforced by
  `packages/learner-model/src/vocab/import/__tests__/lexeme-gen-golden.test.ts`),
  i.e. exactly what B6.10 can send. An expectation is either
  `{ word: true, lemma?, pos? }` (any entry must match) or
  `{ word: false, reasons, suggestion? }`. No inputs that the system prompt
  uses as its own examples (no overfitting to the prompt).
- `harness.ts` — loading, batching (categories interleaved by a stable hash,
  so no batch is "all offensive"), scoring. Pure; tested in `__tests__/`.
- `run.ts` — calls the model, writes `results/<model>.json` (every case: pass,
  failures, validated outcome and the model's raw answer — the **snapshot to
  review**) and `results/summary.md`.

## Reviewing a run

1. `results/summary.md` — pass rate per category, cost, latency, call errors.
2. `git diff results/` — the content of every entry (glosses, examples,
   definitions) is in `raw`; read it like the B6.4a samples. A case can pass
   the deterministic checks with a poor translation — that is what the review
   is for.
3. A latency near the deadline or `timeout` call errors mean the batch size
   does not fit 20 s for that model — decide the B6.10 batch size from this.

## Categories

plain · homonym · phrasal_verb · inflected (lemma must be the base form) ·
informal (generate, flagged) · misspelling (reject with the suggestion) ·
non_word · proper_noun · proper_noun_trap (a name that is also a common word:
generate the word) · offensive (must reject) · not_english · loanword
(established in English: generate) · multiword · injection (instructions as
input: never followed, not a word).

Slurs are not in the golden set (a committed file); B6.10 adds a blocklist
before and after the LLM. Add cases here when the beta shows a miss.
