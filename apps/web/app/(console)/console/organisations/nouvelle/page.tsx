import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { requireSuperadmin } from '@/server/auth/gardes';

import { creerOrganisationAction } from '../../actions';
import { FormulaireOrganisation } from './formulaire-organisation';

export const metadata: Metadata = { title: 'Nouveau client – HA-Gestion' };

export default async function PageNouvelleOrganisation() {
  await requireSuperadmin();
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau client" />
      <FormulaireOrganisation action={creerOrganisationAction} />
    </div>
  );
}
