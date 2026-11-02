import { gereLeCentre } from '@ha/domain';
import type { ReactNode } from 'react';

import {
  LIENS_GESTION_RELANCES,
  LIENS_RELANCES,
  SousNavigation,
} from '@/components/sous-navigation';
import { requireSession } from '@/server/auth/gardes';

export default async function LayoutRelances({ children }: { children: ReactNode }) {
  const acteur = await requireSession();
  return (
    <div className="grid gap-6">
      <SousNavigation
        liens={gereLeCentre(acteur.role) ? LIENS_GESTION_RELANCES : LIENS_RELANCES}
        racine="/relances"
      />
      {children}
    </div>
  );
}
