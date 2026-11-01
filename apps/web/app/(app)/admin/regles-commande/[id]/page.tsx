import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { ouIntrouvable, perimetreCourant } from '@/server/auth/gardes';
import { listerFournisseurs } from '@/server/services/fournisseurs';
import { obtenirRegleCommande } from '@/server/services/regles-commande';

import { modifierRegleAction } from '../actions';
import { FormulaireRegle } from '../formulaire-regle';

export const metadata: Metadata = { title: 'Règle de commande – HA-Gestion' };

export default async function PageRegle({ params }: PageProps<'/admin/regles-commande/[id]'>) {
  const { id } = await params;
  const { acteur, centres } = await perimetreCourant();
  const [regle, fournisseurs] = await Promise.all([
    ouIntrouvable(obtenirRegleCommande(acteur, id)),
    listerFournisseurs(acteur),
  ]);
  return (
    <div className="grid gap-6">
      <EntetePage titre={regle.libelle} />
      <FormulaireRegle
        action={modifierRegleAction.bind(null, id)}
        regle={regle}
        fournisseurs={fournisseurs}
        centres={centres}
      />
    </div>
  );
}
