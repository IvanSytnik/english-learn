import { describe, expect, it } from 'vitest';
import {
  AI_FEATURE_ENABLED_FLAG,
  AI_FEATURES,
  APP_FLAG_DEFAULTS,
  APP_FLAG_KEYS,
  APP_FLAG_SCHEMAS,
} from '../app-flag';

// The raw-SQL CHECKs of migration 20261125120000_ai_usage_app_flag.
const FEATURE_CHECK = /^[a-z][a-z0-9_]{0,63}$/;
const KEY_CHECK = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

describe('AppFlag / AiUsage contract', () => {
  it('every feature id passes the AiUsage feature CHECK and has a kill switch', () => {
    for (const feature of AI_FEATURES) {
      expect(feature).toMatch(FEATURE_CHECK);
      expect(APP_FLAG_KEYS).toContain(AI_FEATURE_ENABLED_FLAG[feature]);
    }
  });

  it('every key passes the AppFlag key CHECK', () => {
    for (const key of APP_FLAG_KEYS) expect(key).toMatch(KEY_CHECK);
  });

  it('every default is valid for its schema and fails closed', () => {
    for (const key of APP_FLAG_KEYS) {
      expect(APP_FLAG_SCHEMAS[key].safeParse(APP_FLAG_DEFAULTS[key]).success).toBe(true);
    }
    for (const feature of AI_FEATURES) {
      expect(APP_FLAG_DEFAULTS[AI_FEATURE_ENABLED_FLAG[feature]]).toBe(false);
    }
    expect(APP_FLAG_DEFAULTS['ai.daily_budget_micro_usd']).toBe(0);
    expect(APP_FLAG_DEFAULTS['ai.user_daily_budget_micro_usd']).toBe(0);
  });

  it('a budget is a non-negative integer of at most $1 000', () => {
    const budget = APP_FLAG_SCHEMAS['ai.daily_budget_micro_usd'];
    expect(budget.safeParse(1_000_000_000).success).toBe(true);
    for (const bad of [-1, 1.5, 1_000_000_001, '100', null]) {
      expect(budget.safeParse(bad).success).toBe(false);
    }
  });
});
