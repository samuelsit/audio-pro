import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ouIntrouvable, requireSession } from '@/server/auth/gardes';
import {
  donneesFormulaireDevis,
  lignesCatalogueDevis,
  obtenirDevis,
} from '@/server/services/devis';

import { modifierDevisAction } from '../../actions';
import { FormulaireDevis } from '../../formulaire-devis';

export const metadata: Metadata = { title: 'Modifier le devis – HA-Gestion' };

export default async function PageModifierDevis({
  params,
}: PageProps<'/dossiers/[id]/devis/[devisId]/modifier'>) {
  const { id, devisId } = await params;
  const acteur = await requireSession();
  const devis = await ouIntrouvable(obtenirDevis(acteur, devisId));
  if (devis.dossierId !== id || !devis.actions.modifier) {
    notFound();
  }
  const [donnees, lignes] = await Promise.all([
    donneesFormulaireDevis(acteur, id),
    lignesCatalogueDevis(acteur, devisId),
  ]);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Devis {devis.numeroAffiche}</h1>
      <FormulaireDevis
        action={modifierDevisAction.bind(null, id, devisId)}
        donnees={donnees}
        devis={devis}
        lignes={lignes}
      />
    </div>
  );
}
