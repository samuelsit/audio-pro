import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { premieresValeurs, type ParametresRecherche } from '@/lib/parametres';
import { requireSession } from '@/server/auth/gardes';
import { fournisseursDuRetour } from '@/server/services/retours-fabricant';

import { FormulairePreparationRetour } from '../../formulaires';

export const metadata: Metadata = { title: 'Nouveau retour – HA-Gestion' };

/** Retour sans ticket : appareil en stock, ou produit non conforme à la réception. */
export default async function PageNouveauRetour({
  searchParams,
}: {
  searchParams: Promise<ParametresRecherche>;
}) {
  const acteur = await requireSession();
  const { appareil, ecart } = premieresValeurs(await searchParams);
  const { options, defaut } = await fournisseursDuRetour(acteur, null);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouveau retour au fabricant" />
      <FormulairePreparationRetour
        appareilId={appareil}
        ecartId={ecart}
        fournisseurs={options}
        defaut={defaut}
      />
    </div>
  );
}
