import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FinalCta } from './_components/final-cta';
import { HowItWorks } from './_components/how-it-works';
import { LandingHeader } from './_components/landing-header';
import { LandingHero } from './_components/landing-hero';
import { LandingNav } from './_components/landing-nav';
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
        <HowItWorks />
        <FinalCta />
      </main>
      <LandingNav />
    </>
  );
}
