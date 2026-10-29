import { z } from 'zod';

/**
 * New vocabulary words per day (StudentProfile.dailyVocabLimit). The range is
 * the column's raw-SQL CHECK StudentProfile_dailyVocabLimit_range (migration
 * 20261029180000_add_lexeme_model); this is its JS twin, checked before a write.
 */
export const DAILY_VOCAB_LIMIT_MIN = 1;
export const DAILY_VOCAB_LIMIT_MAX = 50;

export const DailyVocabLimitSchema = z
  .number()
  .int()
  .min(DAILY_VOCAB_LIMIT_MIN)
  .max(DAILY_VOCAB_LIMIT_MAX);
