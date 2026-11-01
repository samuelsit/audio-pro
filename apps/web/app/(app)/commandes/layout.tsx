import type { ReactNode } from 'react';

import { LIENS_COMMANDES, SousNavigation } from '@/components/sous-navigation';
import { requireSession } from '@/server/auth/gardes';

export default async function LayoutCommandes({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <div className="grid gap-6">
      <SousNavigation liens={LIENS_COMMANDES} racine="/commandes" />
      {children}
    </div>
  );
}
