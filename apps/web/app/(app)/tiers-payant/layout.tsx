import type { ReactNode } from 'react';

import { LIENS_TIERS_PAYANT, SousNavigation } from '@/components/sous-navigation';
import { requireSession } from '@/server/auth/gardes';

export default async function LayoutTiersPayant({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <div className="grid gap-6">
      <SousNavigation liens={LIENS_TIERS_PAYANT} racine="/tiers-payant" />
      {children}
    </div>
  );
}
