import type { ReactNode } from 'react';
import { Footer } from '@/app/_components/footer';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {children}
      <Footer />
    </div>
  );
}
