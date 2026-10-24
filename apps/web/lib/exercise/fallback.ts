/**
 * What /exercises shows when nothing is selectable. Before the diagnostic it
 * points at the diagnostic; after it, pointing there again would loop
 * (/diagnostic only shows the result, whose CTA leads back here).
 */
export function exercisesFallback(diagnosticDone: boolean) {
  return diagnosticDone
    ? ({ text: 'noExercisesYet', cta: 'toDashboard', href: '/dashboard' } as const)
    : ({ text: 'comingSoon', cta: 'startDiagnostic', href: '/diagnostic' } as const);
}
