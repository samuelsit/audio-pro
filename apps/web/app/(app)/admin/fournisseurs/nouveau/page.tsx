import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { requireRole } from '@/server/auth/gardes';
import { listerFabricants } from '@/server/services/catalogue';
import { listerCentrales } from '@/server/services/fournisseurs';

import { creerFournisseurAction } from '../actions';
import { FormulaireFournisseur } from '../formulaire-fournisseur';

export const metadata: Metadata = { title: 'Nouveau fournisseur – HA-Gestion' };

export default async function PageNouveauFournisseur() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const [fabricants, centrales] = await Promise.all([
    listerFabricants(acteur),
    listerCentrales(acteur),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau fournisseur" />
      <FormulaireFournisseur
        action={creerFournisseurAction}
        fabricants={fabricants}
        centrales={centrales}
      />
    </div>
  );
}
