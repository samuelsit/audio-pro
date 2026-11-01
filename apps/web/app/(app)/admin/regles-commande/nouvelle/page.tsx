import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerFournisseurs } from '@/server/services/fournisseurs';

import { creerRegleAction } from '../actions';
import { FormulaireRegle } from '../formulaire-regle';

export const metadata: Metadata = { title: 'Nouvelle règle – HA-Gestion' };

export default async function PageNouvelleRegle() {
  const { acteur, centres } = await perimetreCourant();
  const fournisseurs = await listerFournisseurs(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouvelle règle de commande" />
      <FormulaireRegle action={creerRegleAction} fournisseurs={fournisseurs} centres={centres} />
    </div>
  );
}
