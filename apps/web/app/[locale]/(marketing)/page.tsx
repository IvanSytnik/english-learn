import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LandingHeader } from './_components/landing-header';
import { LandingHero } from './_components/landing-hero';
import { ProblemShift } from './_components/problem-shift';
import { ValueProps } from './_components/value-props';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.meta');
  return { title: t('title'), description: t('description') };
}

/** The landing page: "Coach's chart" (docs/DESIGN.md). */
export default function MarketingPage() {
  return (
    <>
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />
        <ProblemShift />
        <ValueProps />
      </main>
    </>
  );
}
