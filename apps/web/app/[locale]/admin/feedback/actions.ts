'use server';

import { prisma } from '@englishlearn/db';
import {
  BETA_FEEDBACK_LIST_MAX,
  BETA_FEEDBACK_SORTS,
  getBetaFeedbacks,
} from '@englishlearn/db/queries/feedback';
import { z } from 'zod';
import { type AuthzError, authorizeAction } from '@/lib/authz';
import { toFeedbackCsv } from '@/lib/feedback-csv';
import type { Result } from '@/lib/result';

export type ExportFeedbackError = AuthzError | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

const ExportInputSchema = z.object({ sort: z.enum(BETA_FEEDBACK_SORTS) });

/**
 * The feedback list as CSV, in the order the admin is looking at, up to the
 * query's cap (500 newest by that order). Admins only.
 */
export async function exportFeedbackCsvAction(
  input: unknown,
): Promise<Result<{ fileName: string; csv: string }, ExportFeedbackError>> {
  const authz = await authorizeAction('ADMIN');
  if (!authz.ok) return authz;
  const parsed = ExportInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'VALIDATION_ERROR' };
  try {
    const rows = await getBetaFeedbacks(prisma, {
      limit: BETA_FEEDBACK_LIST_MAX,
      sort: parsed.data.sort,
    });
    const day = new Date().toISOString().slice(0, 10);
    return { ok: true, value: { fileName: `beta-feedback-${day}.csv`, csv: toFeedbackCsv(rows) } };
  } catch (err) {
    console.error('exportFeedbackCsv failed', err);
    return { ok: false, error: 'INTERNAL_ERROR' };
  }
}
