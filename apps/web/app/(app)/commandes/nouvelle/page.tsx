import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { perimetreCourant } from '@/server/auth/gardes';
import { listerFournisseurs } from '@/server/services/fournisseurs';

import { FormulaireNouvelleCommande } from '../formulaires';

export const metadata: Metadata = { title: 'Nouvelle demande – HA-Gestion' };

export default async function PageNouvelleCommande() {
  const { acteur, perimetre, centres } = await perimetreCourant();
  const fournisseurs = await listerFournisseurs(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouvelle demande">
        Choisissez le centre livré et le fournisseur, puis ajoutez les lignes.
      </EntetePage>
      <FormulaireNouvelleCommande
        centres={centres}
        centreId={perimetre.type === 'centre' ? perimetre.centreId : undefined}
        fournisseurs={fournisseurs.filter((f) => f.actif)}
      />
    </div>
  );
}
