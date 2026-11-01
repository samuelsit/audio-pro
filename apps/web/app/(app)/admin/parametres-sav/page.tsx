import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { requireRole } from '@/server/auth/gardes';
import { lireParametresSav } from '@/server/services/garanties';

import { enregistrerParametresAction } from './actions';
import { FormulaireParametres } from './formulaire-parametres';

export const metadata: Metadata = { title: 'Paramètres du SAV – HA-Gestion' };

export default async function PageParametresSav() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const parametres = await lireParametresSav(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Paramètres du SAV" />
      <FormulaireParametres action={enregistrerParametresAction} parametres={parametres} />
    </div>
  );
}
