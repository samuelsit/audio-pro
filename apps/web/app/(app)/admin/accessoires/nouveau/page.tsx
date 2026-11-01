import type { Metadata } from 'next';

import { EntetePage } from '@/components/entete-page';
import { requireRole } from '@/server/auth/gardes';
import { listerFournisseurs } from '@/server/services/fournisseurs';

import { creerAccessoireAction } from '../actions';
import { FormulaireAccessoire } from '../formulaire-accessoire';

export const metadata: Metadata = { title: 'Nouvel accessoire – HA-Gestion' };

export default async function PageNouvelAccessoire() {
  const acteur = await requireRole('ADMIN_CLIENT');
  const fournisseurs = await listerFournisseurs(acteur);
  return (
    <div className="grid gap-6">
      <EntetePage titre="Nouvel accessoire" />
      <FormulaireAccessoire action={creerAccessoireAction} fournisseurs={fournisseurs} />
    </div>
  );
}
