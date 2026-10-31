import { peutGererAgenda } from '@ha/domain';
import type { ReactNode } from 'react';

import { SousNavigationAgenda } from '@/components/sous-navigation';
import { requireSession } from '@/server/auth/gardes';

export default async function LayoutAgenda({ children }: { children: ReactNode }) {
  const acteur = await requireSession();
  return (
    <div className="grid gap-6">
      <SousNavigationAgenda gestion={peutGererAgenda(acteur.role)} />
      {children}
    </div>
  );
}
