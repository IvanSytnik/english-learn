import { z } from 'zod';

/**
 * Request-path AI features (B6.9). The id is stored in `AiUsage.feature`
 * (raw-SQL CHECK `AiUsage_feature_id`: `^[a-z][a-z0-9_]{0,63}$`) and names
 * the feature's kill switch below. Add a feature here, then its flag.
 */
export const AI_FEATURES = ['lexeme_generation'] as const;
export const AiFeatureSchema = z.enum(AI_FEATURES);
export type AiFeature = z.infer<typeof AiFeatureSchema>;

/** Integer micro-USD, at most $1 000 — a typo can't open an unbounded budget. */
const MicroUsdSchema = z.number().int().min(0).max(1_000_000_000);

/**
 * Every `AppFlag` key and the shape of its value (B6.9). A key outside this
 * map is never read; `setAppFlag` refuses it. Keys match the raw-SQL CHECK
 * `AppFlag_key_shape` (dotted lowercase segments).
 */
export const APP_FLAG_SCHEMAS = {
  /** Kill switch of B6.10 lexeme generation. */
  'ai.lexeme_generation.enabled': z.boolean(),
  /** Global cap on today's (UTC) AI spend, all users and features. */
  'ai.daily_budget_micro_usd': MicroUsdSchema,
  /** Cap on one user's AI spend today (UTC), all features. */
  'ai.user_daily_budget_micro_usd': MicroUsdSchema,
} as const satisfies Record<string, z.ZodType>;

export type AppFlagKey = keyof typeof APP_FLAG_SCHEMAS;
export type AppFlagValue<K extends AppFlagKey> = z.infer<(typeof APP_FLAG_SCHEMAS)[K]>;

export const APP_FLAG_KEYS = Object.keys(APP_FLAG_SCHEMAS) as AppFlagKey[];

/**
 * What a key reads as when its row is missing, invalid or unreadable:
 * fail closed — AI off, zero budget. Prod needs the rows set explicitly.
 */
export const APP_FLAG_DEFAULTS: { [K in AppFlagKey]: AppFlagValue<K> } = {
  'ai.lexeme_generation.enabled': false,
  'ai.daily_budget_micro_usd': 0,
  'ai.user_daily_budget_micro_usd': 0,
};

/** The kill switch of each AI feature. */
export const AI_FEATURE_ENABLED_FLAG = {
  lexeme_generation: 'ai.lexeme_generation.enabled',
} as const satisfies Record<AiFeature, AppFlagKey>;

export function isAppFlagKey(key: string): key is AppFlagKey {
  return Object.hasOwn(APP_FLAG_SCHEMAS, key);
}
