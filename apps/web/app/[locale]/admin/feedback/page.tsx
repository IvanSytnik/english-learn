import { prisma } from '@englishlearn/db';
import {
  BETA_FEEDBACK_SORTS,
  getBetaFeedbacks,
  parseBetaFeedbackSort,
} from '@englishlearn/db/queries/feedback';
import type { FeedbackKindValue } from '@englishlearn/db/schemas';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireRole } from '@/lib/authz';
import { ExportFeedback } from './export-feedback';

/** How many of the newest reports the page shows. */
const LIST_LIMIT = 200;

const KIND_LABEL = {
  CONTENT_ERROR: 'contentError',
  BUG: 'bug',
  SUGGESTION: 'suggestion',
  OTHER: 'other',
} as const satisfies Record<FeedbackKindValue, string>;

/**
 * Beta feedback, newest first unless `?sort=` says otherwise; the CSV export
 * follows the same order. Everything a reporter typed — text and page URL —
 * is shown as plain text, never as a link or markup.
 */
export default async function FeedbackAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  await requireRole('ADMIN');
  const sort = parseBetaFeedbackSort((await searchParams).sort);

  const [t, tk, format, feedbacks] = await Promise.all([
    getTranslations('admin.feedback'),
    getTranslations('feedback.kinds'),
    getFormatter(),
    getBetaFeedbacks(prisma, { limit: LIST_LIMIT, sort }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-4 text-sm text-ink-muted">{t('subtitle', { count: feedbacks.length })}</p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t('sort.label')} className="flex flex-wrap items-center gap-1 text-sm">
          {BETA_FEEDBACK_SORTS.map((option) =>
            option === sort ? (
              <span
                key={option}
                aria-current="true"
                className="rounded-control border border-line bg-surface-2 px-3 py-1 text-ink"
              >
                {t(`sort.${option}`)}
              </span>
            ) : (
              <Link
                key={option}
                href={{ pathname: '/admin/feedback', query: { sort: option } }}
                className="rounded-control px-3 py-1 text-ink-muted underline-offset-4 hover:text-ink hover:underline"
              >
                {t(`sort.${option}`)}
              </Link>
            ),
          )}
        </nav>
        {feedbacks.length > 0 ? <ExportFeedback sort={sort} /> : null}
      </div>
      {feedbacks.length === 0 ? (
        <p className="text-ink-muted">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-surface-2">
              <tr>
                {(['createdAt', 'user', 'kind', 'text', 'url', 'item', 'concept'] as const).map(
                  (column) => (
                    <th key={column} className="px-4 py-2 text-left font-medium text-ink-muted">
                      {t(`columns.${column}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {feedbacks.map((f) => (
                <tr key={f.id} className="align-top" data-feedback-row={f.id}>
                  <td className="whitespace-nowrap px-4 py-2">
                    <time dateTime={f.createdAt.toISOString()}>
                      {format.dateTime(f.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                  </td>
                  <td className="px-4 py-2">
                    <div>{f.user.email}</div>
                    {f.user.name ? <div className="text-ink-muted">{f.user.name}</div> : null}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-block whitespace-nowrap rounded-control border border-line px-2 py-0.5 text-xs">
                      {tk(KIND_LABEL[f.kind])}
                    </span>
                  </td>
                  <td className="max-w-md whitespace-pre-wrap break-words px-4 py-2">{f.text}</td>
                  <td className="px-4 py-2 font-mono text-xs break-all">{f.url}</td>
                  <td className="px-4 py-2 font-mono text-xs break-all">{f.itemId ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs break-all">{f.conceptId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
