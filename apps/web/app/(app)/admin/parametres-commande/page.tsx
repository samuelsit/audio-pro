import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { requireRole } from '@/server/auth/gardes';
import { lireParametresCommande } from '@/server/services/fournisseurs';

import { enregistrerParametresAction } from './actions';
import { FormulaireParametres } from './formulaire-parametres';

export const metadata: Metadata = { title: 'Paramètres des commandes – HA-Gestion' };

export default async function PageParametresCommande() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const parametres = await lireParametresCommande(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Paramètres des commandes" />
      <FormulaireParametres action={enregistrerParametresAction} parametres={parametres} />
    </div>
  );
}
