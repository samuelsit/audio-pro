import type { Metadata } from 'next';

import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import { donneesFormulaireDevis } from '@/server/services/devis';

import { creerDevisAction } from '../actions';
import { FormulaireDevis } from '../formulaire-devis';

export const metadata: Metadata = { title: 'Nouveau devis – HA-Gestion' };

export default async function PageNouveauDevis({
  params,
}: PageProps<'/dossiers/[id]/devis/nouveau'>) {
  const { id } = await params;
  const acteur = await requireSession();
  const donnees = await ouIntrouvable(donneesFormulaireDevis(acteur, id));
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Nouveau devis</h1>
      <FormulaireDevis action={creerDevisAction.bind(null, id)} donnees={donnees} />
    </div>
  );
}
