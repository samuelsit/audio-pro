import { peutGererCaisse } from '@ha/domain';
import type { ReactNode } from 'react';

import { LIENS_CAISSE, LIENS_GESTION_CAISSE, SousNavigation } from '@/components/sous-navigation';
import { requireSession } from '@/server/auth/gardes';

export default async function LayoutCaisse({ children }: { children: ReactNode }) {
  const acteur = await requireSession();
  const liens = peutGererCaisse(acteur.role) ? LIENS_GESTION_CAISSE : LIENS_CAISSE;
  return (
    <div className="grid gap-6">
      <SousNavigation liens={liens} racine="/caisse" />
      {children}
    </div>
  );
}
