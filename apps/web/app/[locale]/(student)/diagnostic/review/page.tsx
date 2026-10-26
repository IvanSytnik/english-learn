import { isLocale } from '@englishlearn/db/schemas';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { type DiagnosticReviewView, getDiagnosticReview } from '@/lib/diagnostic';
import { DiagnosticReview } from './diagnostic-review';

/**
 * /diagnostic/review: the learner's own completed attempt, question by
 * question. Without one (not finished, another role, a failed read) the
 * learner goes back to /diagnostic, which shows whatever comes next.
 */
export default async function DiagnosticReviewPage() {
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user) return redirect({ href: '/login', locale });

  let review: DiagnosticReviewView | null = null;
  if (session.user.role === 'STUDENT') {
    try {
      review = await getDiagnosticReview(session.user.id, isLocale(locale) ? locale : 'en');
    } catch (e) {
      console.error('[diagnostic] review failed', e);
    }
  }
  if (!review) return redirect({ href: '/diagnostic', locale });

  return <DiagnosticReview review={review} />;
}
