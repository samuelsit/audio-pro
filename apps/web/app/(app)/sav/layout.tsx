import type { ReactNode } from 'react';

import { LIENS_SAV, SousNavigation } from '@/components/sous-navigation';
import { requireSession } from '@/server/auth/gardes';

export default async function LayoutSav({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <div className="grid gap-6">
      <SousNavigation liens={LIENS_SAV} racine="/sav" />
      {children}
    </div>
  );
}
